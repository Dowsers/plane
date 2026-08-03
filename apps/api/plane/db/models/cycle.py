# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytz

# Django imports
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

# Module imports
from .project import ProjectBaseModel


def get_default_filters():
    return {
        "priority": None,
        "state": None,
        "state_group": None,
        "assignees": None,
        "created_by": None,
        "labels": None,
        "start_date": None,
        "target_date": None,
        "subscriber": None,
    }


def get_default_display_filters():
    return {
        "group_by": None,
        "order_by": "-created_at",
        "type": None,
        "sub_issue": True,
        "show_empty_groups": True,
        "layout": "list",
        "calendar_date_range": "",
    }


def get_default_display_properties():
    return {
        "assignee": True,
        "attachment_count": True,
        "created_on": True,
        "due_date": True,
        "estimate": True,
        "key": True,
        "labels": True,
        "link": True,
        "priority": True,
        "start_date": True,
        "state": True,
        "sub_issue_count": True,
        "updated_on": True,
    }


class Cycle(ProjectBaseModel):
    name = models.CharField(max_length=255, verbose_name="Cycle Name")
    description = models.TextField(verbose_name="Cycle Description", blank=True)
    start_date = models.DateTimeField(verbose_name="Start Date", blank=True, null=True)
    end_date = models.DateTimeField(verbose_name="End Date", blank=True, null=True)
    # Manual start/stop, independent of the scheduled start_date/end_date -
    # see docs/feature-specs/02-cycles-intake.md ("Démarrage/arrêt manuel
    # d'un cycle") in plane-selfhost. When set, these take priority over the
    # date-based CURRENT/UPCOMING/COMPLETED status computation.
    actual_start_date = models.DateTimeField(null=True, blank=True)
    actual_end_date = models.DateTimeField(null=True, blank=True)
    # Recurring auto-scheduling - see docs/feature-specs/02-cycles-intake.md
    # ("Moteur de auto-scheduling de cycles récurrents") in plane-selfhost.
    generated_by_schedule = models.ForeignKey(
        "db.CycleAutoScheduleConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_cycles",
    )
    is_auto_scheduled = models.BooleanField(default=False)
    # Idempotency marker for the rollover task - set once the incomplete
    # issues of this cycle have been transferred to its successor, so a
    # delayed/retried task run never double-transfers.
    auto_rollover_completed_at = models.DateTimeField(null=True, blank=True)
    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_by_cycle",
    )
    view_props = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)
    progress_snapshot = models.JSONField(default=dict)
    archived_at = models.DateTimeField(null=True)
    logo_props = models.JSONField(default=dict)
    # timezone
    TIMEZONE_CHOICES = tuple(zip(pytz.common_timezones, pytz.common_timezones))
    timezone = models.CharField(max_length=255, default="UTC", choices=TIMEZONE_CHOICES)
    version = models.IntegerField(default=1)

    class Meta:
        verbose_name = "Cycle"
        verbose_name_plural = "Cycles"
        db_table = "cycles"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self._state.adding:
            smallest_sort_order = Cycle.objects.filter(project=self.project).aggregate(
                smallest=models.Min("sort_order")
            )["smallest"]

            if smallest_sort_order is not None:
                self.sort_order = smallest_sort_order - 10000

        super(Cycle, self).save(*args, **kwargs)

    def __str__(self):
        """Return name of the cycle"""
        return f"{self.name} <{self.project.name}>"


class CycleAutoScheduleConfig(ProjectBaseModel):
    """
    Recurring cycle auto-scheduling configuration, one per project - see
    docs/feature-specs/02-cycles-intake.md ("Moteur de auto-scheduling de
    cycles récurrents") in plane-selfhost.
    """

    project = models.OneToOneField(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="cycle_auto_schedule_config",
    )
    is_enabled = models.BooleanField(default=False)
    cadence_weeks = models.PositiveSmallIntegerField(
        default=2, validators=[MinValueValidator(1), MaxValueValidator(12)]
    )
    cooldown_days = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(14)])
    lookahead_count = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(3)]
    )
    # 0 = Monday ... 6 = Sunday, matching Python's date.weekday()
    start_day_of_week = models.SmallIntegerField(
        default=0, validators=[MinValueValidator(0), MaxValueValidator(6)]
    )
    naming_template = models.CharField(max_length=255, default="Cycle {number}")
    rollover_enabled = models.BooleanField(default=False)
    next_auto_number = models.PositiveIntegerField(default=1)
    last_run_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Cycle Auto Schedule Config"
        verbose_name_plural = "Cycle Auto Schedule Configs"
        db_table = "cycle_auto_schedule_configs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"Auto-schedule config <{self.project.name}>"


class CycleIssue(ProjectBaseModel):
    """
    Cycle Issues
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="issue_cycle")
    cycle = models.ForeignKey(Cycle, on_delete=models.CASCADE, related_name="issue_cycle")

    class Meta:
        unique_together = ["issue", "cycle", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["cycle", "issue"],
                condition=models.Q(deleted_at__isnull=True),
                name="cycle_issue_when_deleted_at_null",
            )
        ]
        verbose_name = "Cycle Issue"
        verbose_name_plural = "Cycle Issues"
        db_table = "cycle_issues"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.cycle}"


class CycleUserProperties(ProjectBaseModel):
    # Per-user cycle progress chart preferences - see
    # docs/feature-specs/05-insights-analytics.md ("Graphiques de
    # progression cycle/projet", exigence 3) in plane-selfhost. Persisted
    # per (cycle, user) rather than globally, matching the spec's
    # requirement that the burndown/burn-up toggle and the issues/points
    # unit are a per-user, not per-workspace, preference.
    CHART_TYPE_CHOICES = (("burndown", "Burn-down"), ("burnup", "Burn-up"))
    ESTIMATE_TYPE_CHOICES = (("issues", "Issues"), ("points", "Points"))

    cycle = models.ForeignKey("db.Cycle", on_delete=models.CASCADE, related_name="cycle_user_properties")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cycle_user_properties",
    )
    filters = models.JSONField(default=get_default_filters)
    display_filters = models.JSONField(default=get_default_display_filters)
    display_properties = models.JSONField(default=get_default_display_properties)
    rich_filters = models.JSONField(default=dict)
    chart_type = models.CharField(max_length=10, choices=CHART_TYPE_CHOICES, default="burndown")
    estimate_type = models.CharField(max_length=10, choices=ESTIMATE_TYPE_CHOICES, default="issues")

    class Meta:
        unique_together = ["cycle", "user", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["cycle", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="cycle_user_properties_unique_cycle_user_when_deleted_at_null",
            )
        ]
        verbose_name = "Cycle User Property"
        verbose_name_plural = "Cycle User Properties"
        db_table = "cycle_user_properties"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.cycle.name} {self.user.email}"
