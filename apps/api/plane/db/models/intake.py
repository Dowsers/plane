# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel


class Intake(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(verbose_name="Intake Description", blank=True)
    is_default = models.BooleanField(default=False)
    view_props = models.JSONField(default=dict)
    logo_props = models.JSONField(default=dict)

    def __str__(self):
        """Return name of the intake"""
        return f"{self.name} <{self.project.name}>"

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="intake_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Intake"
        verbose_name_plural = "Intakes"
        db_table = "intakes"
        ordering = ("name",)


class SourceType(models.TextChoices):
    IN_APP = "IN_APP"


class IntakeIssueStatus(models.IntegerChoices):
    PENDING = -2
    REJECTED = -1
    SNOOZED = 0
    ACCEPTED = 1
    DUPLICATE = 2


class IntakeIssue(ProjectBaseModel):
    intake = models.ForeignKey("db.Intake", related_name="issue_intake", on_delete=models.CASCADE)
    issue = models.ForeignKey("db.Issue", related_name="issue_intake", on_delete=models.CASCADE)
    status = models.IntegerField(
        choices=(
            (-2, "Pending"),
            (-1, "Rejected"),
            (0, "Snoozed"),
            (1, "Accepted"),
            (2, "Duplicate"),
        ),
        default=-2,
    )
    snoozed_till = models.DateTimeField(null=True)
    duplicate_to = models.ForeignKey(
        "db.Issue",
        related_name="intake_duplicate",
        on_delete=models.SET_NULL,
        null=True,
    )
    source = models.CharField(max_length=255, default="IN_APP", null=True, blank=True)
    source_email = models.TextField(blank=True, null=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)
    extra = models.JSONField(default=dict)
    # Responsabilité d'intake & auto-routage - see
    # docs/feature-specs/02-cycles-intake.md in plane-selfhost.
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_assignments",
    )
    assigned_at = models.DateTimeField(null=True, blank=True)
    escalation_count = models.PositiveIntegerField(default=0)
    last_escalated_at = models.DateTimeField(null=True, blank=True)
    assignment_source = models.CharField(
        max_length=20,
        choices=(("manual", "Manual"), ("fixed_owner", "Fixed owner"), ("round_robin", "Round robin")),
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "IntakeIssue"
        verbose_name_plural = "IntakeIssues"
        db_table = "intake_issues"
        ordering = ("-created_at",)

    def __str__(self):
        """Return name of the Issue"""
        return f"{self.issue.name} <{self.intake.name}>"


class IntakeResponsibilitySetting(ProjectBaseModel):
    """
    Per-project intake responsibility/auto-routing configuration - see
    docs/feature-specs/02-cycles-intake.md ("Responsabilité d'intake &
    auto-routage") in plane-selfhost. On-call shift calendars and
    PagerDuty/OpsGenie sync are explicitly out of scope for this iteration -
    only fixed_owner and round_robin modes are supported.
    """

    project = models.OneToOneField(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="intake_responsibility_setting",
    )
    is_enabled = models.BooleanField(default=False)
    assignment_mode = models.CharField(
        max_length=20,
        choices=(("fixed_owner", "Fixed owner"), ("round_robin", "Round robin")),
        default="round_robin",
    )
    fixed_owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_fixed_owner_settings",
    )
    escalation_timeout_minutes = models.PositiveIntegerField(
        default=60, validators=[MinValueValidator(5), MaxValueValidator(1440)]
    )
    # Persistent round-robin pointer - exigence 8 de la spec (jamais remis à
    # zéro entre deux items), muté sous select_for_update() pour
    # l'atomicité (exigence 14).
    rotation_cursor = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Intake Responsibility Setting"
        verbose_name_plural = "Intake Responsibility Settings"
        db_table = "intake_responsibility_settings"
        ordering = ("-created_at",)

    def __str__(self):
        return f"Intake responsibility <{self.project.name}>"


class IntakeRotationMember(ProjectBaseModel):
    responsibility_setting = models.ForeignKey(
        IntakeResponsibilitySetting,
        on_delete=models.CASCADE,
        related_name="rotation_members",
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="intake_rotation_memberships",
    )
    sort_order = models.FloatField(default=65535)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ["responsibility_setting", "member", "deleted_at"]
        verbose_name = "Intake Rotation Member"
        verbose_name_plural = "Intake Rotation Members"
        db_table = "intake_rotation_members"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.member_id} <{self.responsibility_setting_id}>"
