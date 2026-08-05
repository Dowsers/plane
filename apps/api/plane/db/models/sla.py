# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
SLA policies - see docs/feature-specs/06-automation-workflow-sla.md
("Politiques de SLA", section 2) in plane-selfhost.

Matching + due-date calculation logic lives in plane/utils/sla_engine.py,
async dispatch in plane/bgtasks/sla_task.py. This module only defines the
two new tables (`Issue.sla_risk_level` is added directly on
plane/db/models/issue.py instead, since it's a denormalized field on an
existing model, not a new one).
"""

# Django imports
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel
from .workspace import WorkspaceBaseModel


class SLAPolicy(WorkspaceBaseModel):
    """
    Workspace-level SLA policy: a set of AND-combined match criteria plus
    one or two time budgets (response/resolution), applied to every issue
    that matches - see exigences 2-4 of the spec referenced above.

    DEVIATION FROM THE SPEC'S OWN CITED PRECEDENT: the spec's "Implications
    sur le modele de donnees" section justifies `projects` being "M2M vers
    Project, blank - vide = toute l'organisation" by citing
    "IssueView.projects deja present dans le code" as prior art. That
    precedent does not exist: `IssueView` (see `view.py`) has a single
    **nullable FK** `project` inherited from `WorkspaceBaseModel`, not an
    M2M, and `project=None` there means "this view is workspace-scoped",
    not "applies to every project via an empty M2M". The only genuine
    M2M-to-Project field anywhere in this codebase is `Page.projects`
    (`page.py`), and even that model does NOT infer "applies everywhere"
    from an empty M2M - it carries a separate explicit `is_global`
    BooleanField for exactly that semantic. That's the safer design for a
    good reason: a bug (or an admin accidentally clearing the M2M through
    the UI) that empties `projects` would otherwise silently flip a policy
    from "applies to a handful of projects" to "applies workspace-wide",
    which is a much more dangerous failure mode for something that starts
    computing due dates and firing breach notifications the moment it
    "matches" than the equivalent bug on a saved view. This model follows
    `Page`'s safer pattern instead: `applies_to_all_projects` is the only
    thing that means "all projects" - `projects` is only consulted when it
    is False, and an empty `projects` with `applies_to_all_projects=False`
    matches no project at all (see `plane.utils.sla_engine`).
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")

    # See class docstring for why this differs from the spec's own
    # (factually incorrect) suggested precedent.
    projects = models.ManyToManyField("db.Project", blank=True, related_name="sla_policies")
    applies_to_all_projects = models.BooleanField(default=False)

    priority_filter = ArrayField(models.CharField(max_length=30), blank=True, default=list)
    labels = models.ManyToManyField("db.Label", blank=True, related_name="sla_policies")
    assignees = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="sla_policies")
    # Values are `StateGroup` choices (see state.py) - not a FK/enum
    # constraint at the DB level, validated at the view/serializer layer,
    # same convention as `priority_filter` above.
    state_group_filter = ArrayField(models.CharField(max_length=20), blank=True, default=list)

    # At least one of these two must be set - app-level validation only
    # (see app/views/sla/base.py), deliberately not a DB CHECK constraint
    # per the spec's own "pas contrainte DB stricte pour rester simple".
    response_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    resolution_time_minutes = models.PositiveIntegerField(null=True, blank=True)

    warning_threshold_percent = models.PositiveSmallIntegerField(default=75)
    critical_threshold_percent = models.PositiveSmallIntegerField(default=90)

    is_active = models.BooleanField(default=True)

    # Lowest sort_order wins among matching policies for the same issue
    # (exigence 4); ties broken by most-recently-created (see
    # plane.utils.sla_engine.find_matching_policy). Same "auto-increment by
    # 10000 on create" convention as IssueView.sort_order/Page.sort_order/
    # DashboardWidget.sort_order.
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "SLA Policy"
        verbose_name_plural = "SLA Policies"
        db_table = "sla_policies"
        ordering = ("sort_order", "-created_at")

    def save(self, *args, **kwargs):
        if self._state.adding:
            largest_sort_order = SLAPolicy.objects.filter(workspace=self.workspace).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if largest_sort_order is not None:
                self.sort_order = largest_sort_order + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"


class IssueSLA(ProjectBaseModel):
    """One row per issue per active delay type (response and/or
    resolution) on the policy that matched it at compute time - see
    exigence 3. `sla_policy` is SET_NULL (not CASCADE) specifically so a
    later soft-deleted policy doesn't erase the historical compliance
    record (exigence 10)."""

    SLA_TYPE_CHOICES = (("response", "Response"), ("resolution", "Resolution"))

    # `paused` is part of the spec's own STATUS_CHOICES (exigence 7) but,
    # per this fork's actual StateGroup enum (state.py) having no "on
    # hold"/blocked group at all, there is no code path in
    # plane.utils.sla_engine that ever assigns it in v1 - see that module's
    # docstring for the full reasoning. It's kept in the schema for forward
    # compatibility rather than removed.
    STATUS_CHOICES = (
        ("on_track", "On track"),
        ("at_risk", "At risk"),
        ("breached", "Breached"),
        ("achieved", "Achieved"),
        ("cancelled", "Cancelled"),
        ("paused", "Paused"),
    )

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="sla_entries")
    sla_policy = models.ForeignKey(
        "db.SLAPolicy",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issue_sla_entries",
    )
    sla_type = models.CharField(max_length=20, choices=SLA_TYPE_CHOICES)
    due_at = models.DateTimeField()
    met_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="on_track", db_index=True)
    breached_at = models.DateTimeField(null=True, blank=True)
    # Not part of the spec's own model list - needed to satisfy exigence 8's
    # "declenche exactement une notification [par seuil franchi] - pas de
    # spam a chaque recalcul si le statut n'a pas change": tracks the last
    # status a Notification was actually created for, so the 5-minute
    # recalculation task only fires again once `status` has moved on from
    # whatever it last notified about (see plane.utils.sla_engine).
    last_notified_status = models.CharField(max_length=20, null=True, blank=True)

    class Meta:
        verbose_name = "Issue SLA"
        verbose_name_plural = "Issue SLAs"
        db_table = "issue_slas"
        ordering = ("-created_at",)
        unique_together = ["issue", "sla_policy", "sla_type", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "sla_policy", "sla_type"],
                condition=Q(deleted_at__isnull=True),
                name="issue_sla_unique_issue_policy_type_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.issue_id} {self.sla_type} {self.status}"
