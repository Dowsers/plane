# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q
from django.utils.html import strip_tags

# Module imports
from .issue import Issue
from .project import ProjectBaseModel


class RecurringIssueTemplate(ProjectBaseModel):
    """
    Template that periodically materializes real, full-fledged `Issue`
    rows on a recurrence schedule - see
    docs/feature-specs/06-automation-workflow-sla.md ("Work items
    récurrents", section 3) in plane-selfhost. The recurrence math itself
    lives in `plane/utils/recurring_issue_schedule.py` (pure functions,
    unit-testable without the DB); the hourly scan/materialization lives in
    `plane/bgtasks/recurring_issue_task.py`.
    """

    FREQUENCY_CHOICES = (
        ("DAILY", "Daily"),
        ("WEEKLY", "Weekly"),
        ("MONTHLY", "Monthly"),
        ("YEARLY", "Yearly"),
    )

    name = models.CharField(max_length=255, verbose_name="Template Name")
    # Issue has no bare "description" field of its own - only
    # description_json/description_html/description_stripped/description_binary
    # (see Issue's field definitions in `issue.py`), the last two of which
    # are specific to the real-time collaborative rich-text editor and
    # don't apply to a template that's never opened in that editor.
    # `description_html` mirrors Issue.description_html exactly
    # (TextField, blank=True, default="<p></p>") and is copied verbatim
    # into each generated Issue's own description_html at generation time.
    # `description` is this model's plain-text mirror of
    # Issue.description_stripped - auto-derived from description_html on
    # save() the same way Issue derives description_stripped - kept mainly
    # for quick display (e.g. a template list) without needing to strip
    # HTML client-side.
    description = models.TextField(blank=True, default="")
    description_html = models.TextField(blank=True, default="<p></p>")
    priority = models.CharField(
        max_length=30,
        choices=Issue.PRIORITY_CHOICES,
        verbose_name="Issue Priority",
        default="none",
    )
    # SET_NULL + generation-time fallback chain (template.state -> the
    # project's own default_state -> the project's first Backlog-group
    # state) - see exigence 14 and `_resolve_generation_state` in
    # `plane/bgtasks/recurring_issue_task.py`. related_name can't reuse
    # Issue.state's own "state_issue" (would clash - both point at State).
    state = models.ForeignKey(
        "db.State",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recurring_issue_template_state",
    )
    estimate_point = models.ForeignKey(
        "db.EstimatePoint",
        on_delete=models.SET_NULL,
        related_name="recurring_issue_template_estimates",
        null=True,
        blank=True,
    )
    # null=True/blank=True (beyond what the brief's literal field list
    # says) so `POST .../issues/<id>/convert-to-recurring/` can create a
    # not-yet-configured draft template (is_active=False, no recurrence
    # rule yet) - per that endpoint's own spec: "renvoie l'objet
    # RecurringIssueTemplate créé, non encore actif tant que la récurrence
    # n'est pas configurée" and the recurrence fields are explicitly NOT
    # set by that endpoint. `frequency`/`start_date` being required is
    # instead enforced at the view level for the normal create endpoint
    # and before allowing activation (pause/resume) of a draft.
    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, null=True, blank=True)
    # "every N occurrences" of the chosen frequency unit - see
    # `plane/utils/recurring_issue_schedule.py` module docstring for the
    # exact phase-locked-to-start_date semantics used for WEEKLY/MONTHLY/YEARLY.
    interval = models.PositiveSmallIntegerField(default=1)
    # Only meaningful when frequency == WEEKLY. Uses Python's
    # `datetime.date.weekday()` convention: 0=Monday ... 6=Sunday (NOT
    # ISO's 1=Monday, and NOT Sunday-first).
    weekdays = ArrayField(models.PositiveSmallIntegerField(), default=list, blank=True)
    # Only meaningful for MONTHLY/YEARLY. 29/30/31 clamp to the actual
    # last day of a shorter target month (e.g. 31 -> 30 in a 30-day month)
    # rather than rolling over into the next month - see
    # `recurring_issue_schedule._clamp_day_of_month`.
    day_of_month = models.PositiveSmallIntegerField(null=True, blank=True)
    # Only meaningful for YEARLY. 1-12.
    month_of_year = models.PositiveSmallIntegerField(null=True, blank=True)
    # Defaults to the owning project's own `timezone` at creation time (see
    # `Project.timezone` - already an IANA-name CharField with the same
    # `pytz.common_timezones` choices, added by this fork's Category 5
    # work) - set explicitly by the view at creation time rather than via a
    # static model-level default, since the "right" default depends on
    # which project the template belongs to.
    timezone = models.CharField(max_length=255, default="UTC")
    # null=True/blank=True for the same convert-to-recurring draft reason
    # as `frequency` above.
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    max_occurrences = models.PositiveIntegerField(null=True, blank=True)
    occurrences_generated = models.PositiveIntegerField(default=0)
    # Scanned by the hourly `generate_recurring_issues` Celery Beat task -
    # see `plane/bgtasks/recurring_issue_task.py`.
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True)

    labels = models.ManyToManyField(
        "db.Label",
        blank=True,
        related_name="recurring_issue_templates",
        through="RecurringIssueTemplateLabel",
        through_fields=("template", "label"),
    )
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="recurring_issue_template_assignee",
        through="RecurringIssueTemplateAssignee",
        through_fields=("template", "assignee"),
    )

    class Meta:
        verbose_name = "Recurring Issue Template"
        verbose_name_plural = "Recurring Issue Templates"
        db_table = "recurring_issue_templates"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        # Mirrors Issue's own description_stripped derivation (see
        # Issue.save() in issue.py).
        self.description = "" if not self.description_html else strip_tags(self.description_html)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} <{self.project_id}>"


class RecurringIssueTemplateLabel(ProjectBaseModel):
    """Mirrors `IssueLabel`'s shape exactly (two plain FKs, no extra
    uniqueness constraint), with `template` standing in for `issue`."""

    template = models.ForeignKey(
        RecurringIssueTemplate, on_delete=models.CASCADE, related_name="template_labels"
    )
    label = models.ForeignKey("db.Label", on_delete=models.CASCADE, related_name="recurring_issue_template_label")

    class Meta:
        verbose_name = "Recurring Issue Template Label"
        verbose_name_plural = "Recurring Issue Template Labels"
        db_table = "recurring_issue_template_labels"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.template.name} {self.label.name}"


class RecurringIssueTemplateAssignee(ProjectBaseModel):
    """Mirrors `IssueAssignee`'s shape exactly, including its partial
    unique constraint on `(issue, assignee)` where `deleted_at IS NULL` -
    here `(template, assignee)`."""

    template = models.ForeignKey(
        RecurringIssueTemplate, on_delete=models.CASCADE, related_name="template_assignees"
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recurring_issue_template_assignee_through",
    )

    class Meta:
        unique_together = ["template", "assignee", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["template", "assignee"],
                condition=Q(deleted_at__isnull=True),
                name="recurring_template_assignee_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Recurring Issue Template Assignee"
        verbose_name_plural = "Recurring Issue Template Assignees"
        db_table = "recurring_issue_template_assignees"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.template.name} {self.assignee.email}"
