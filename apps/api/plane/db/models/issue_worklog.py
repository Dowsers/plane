# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .project import ProjectBaseModel


class IssueWorklog(ProjectBaseModel):
    """
    A single manual time entry logged against a work item - see
    docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking
    and Work Logs", feature 1 "Saisie de temps par work item") in
    plane-selfhost.

    Creation is gated in the view layer by `Project.is_time_tracking_enabled`
    (exigence 2) - this model itself carries no such constraint, matching
    how `IssueComment`/`IssueLink` don't police project-level feature flags
    either.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="issue_worklogs")
    logged_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="worklogs")
    duration = models.PositiveIntegerField(help_text="Duration in minutes, validated >= 1 in the serializer")
    logged_at = models.DateField(help_text="Date the work was actually performed, distinct from created_at")
    description = models.TextField(blank=True)
    # Set once this entry is included in a submitted TimesheetPeriod (feature
    # 3, "Workflow d'approbation de timesheet") - null until then. SET_NULL
    # rather than CASCADE so deleting a TimesheetPeriod never deletes the
    # underlying worklog entries.
    timesheet_period = models.ForeignKey(
        "db.TimesheetPeriod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="worklogs",
    )

    class Meta:
        verbose_name = "Issue Worklog"
        verbose_name_plural = "Issue Worklogs"
        db_table = "issue_worklogs"
        ordering = ("-logged_at", "-created_at")
        indexes = [models.Index(fields=["issue", "logged_at"], name="issue_worklog_issue_logged_idx")]

    def __str__(self):
        return f"{self.logged_by_id} logged {self.duration}min on {self.issue_id} <{self.logged_at}>"


class TimesheetPeriod(ProjectBaseModel):
    """
    Groups one author's IssueWorklog entries on a given project over a
    period (week or month, see Workspace.timesheet_period_granularity) into
    a draft/submitted/approved/rejected approval state machine - see
    docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking
    and Work Logs", feature 3 "Workflow d'approbation de timesheet") in
    plane-selfhost.

    Scoped to a project (via ProjectBaseModel) because the default approver
    is the project's `project_lead` (exigence 3) - approval is a
    per-project concern, not a cross-project one.
    """

    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("submitted", "Submitted"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    )

    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="timesheet_periods"
    )
    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_timesheet_periods",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        verbose_name = "Timesheet Period"
        verbose_name_plural = "Timesheet Periods"
        db_table = "timesheet_periods"
        ordering = ("-period_start",)
        unique_together = ["project", "logged_by", "period_start", "period_end", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "logged_by", "period_start", "period_end"],
                condition=models.Q(deleted_at__isnull=True),
                name="timesheet_period_unique_when_deleted_at_null",
            )
        ]
        indexes = [
            models.Index(fields=["project", "logged_by", "status"], name="timesheet_period_status_idx")
        ]

    def __str__(self):
        return f"{self.logged_by_id} {self.period_start}..{self.period_end} <{self.status}>"
