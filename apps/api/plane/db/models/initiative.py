# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class Initiative(BaseModel):
    """
    Workspace-level grouping of Projects toward a strategic goal, with a
    health rollup derived from its linked projects - see
    docs/feature-specs/03-projects-roadmaps-initiatives.md ("Entité
    Initiatives") in plane-selfhost.
    """

    STATUS_CHOICES = (
        ("PROPOSED", "Proposed"),
        ("PLANNED", "Planned"),
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed"),
        ("CANCELED", "Canceled"),
    )
    HEALTH_CHOICES = (
        ("on-track", "On Track"),
        ("at-risk", "At Risk"),
        ("off-track", "Off Track"),
    )

    workspace = models.ForeignKey("db.Workspace", related_name="initiatives", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    description_html = models.TextField(blank=True, default="<p></p>")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PLANNED")
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="initiatives_led",
        on_delete=models.SET_NULL,
    )
    start_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    # Denormalized worst-case rollup of linked Project.health - recalculated
    # via an explicit call (recalculate_initiative_health, in
    # plane/utils/initiative_health.py), never a Django signal, matching
    # this codebase's established no-signals convention.
    health = models.CharField(max_length=20, null=True, blank=True, choices=HEALTH_CHOICES)
    logo_props = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)
    external_id = models.CharField(max_length=255, blank=True, null=True)
    external_source = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        verbose_name = "Initiative"
        verbose_name_plural = "Initiatives"
        db_table = "initiatives"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self._state.adding:
            smallest_sort_order = Initiative.objects.filter(workspace=self.workspace).aggregate(
                smallest=models.Min("sort_order")
            )["smallest"]

            if smallest_sort_order is not None:
                self.sort_order = smallest_sort_order - 10000

        super(Initiative, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"


class InitiativeProject(BaseModel):
    initiative = models.ForeignKey(Initiative, related_name="project_links", on_delete=models.CASCADE)
    project = models.ForeignKey("db.Project", related_name="initiative_links", on_delete=models.CASCADE)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="initiative_project_links")
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["initiative", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["initiative", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="initiative_project_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Initiative Project"
        verbose_name_plural = "Initiative Projects"
        db_table = "initiative_projects"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.initiative_id} <-> {self.project_id}"


class InitiativeActivity(BaseModel):
    """
    Lightweight persisted activity log for an Initiative - deliberately NOT
    the full per-field IssueActivity/ISSUE_ACTIVITY_MAPPER machinery (that's
    issue-specific). model_activity/webhook_activity
    (plane/bgtasks/webhook_task.py) is outbound-webhook-only and persists
    nothing queryable, so a real table is needed to back
    GET .../initiatives/<id>/activities/.
    """

    initiative = models.ForeignKey(Initiative, related_name="activities", on_delete=models.CASCADE)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="initiative_activities")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="initiative_activities"
    )
    verb = models.CharField(max_length=255, default="updated")
    field = models.CharField(max_length=255, null=True, blank=True)
    old_value = models.TextField(blank=True, null=True)
    new_value = models.TextField(blank=True, null=True)
    comment = models.TextField(blank=True)

    class Meta:
        verbose_name = "Initiative Activity"
        verbose_name_plural = "Initiative Activities"
        db_table = "initiative_activities"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.verb}:{self.field} <{self.initiative_id}>"
