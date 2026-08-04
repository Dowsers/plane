# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import secrets

# Django imports
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel


def get_intake_form_token():
    return secrets.token_urlsafe(24)


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
    PUBLIC_FORM = "PUBLIC_FORM"
    API = "API"
    # Skeleton only - see docker/api/omnichannel-intake-skeleton/README.md.
    EMAIL = "EMAIL"
    SLACK = "SLACK"


class IntakeIssueStatus(models.IntegerChoices):
    PENDING = -2
    REJECTED = -1
    SNOOZED = 0
    ACCEPTED = 1
    DUPLICATE = 2


class IntakeForm(ProjectBaseModel):
    """
    Public, unauthenticated intake submission form - see
    docs/feature-specs/02-cycles-intake.md ("Formulaire web public
    d'intake") in plane-selfhost. Attachments are explicitly out of scope
    for this iteration - see docker/api/public-intake-form/README.md in
    plane-selfhost.
    """

    name = models.CharField(max_length=255)
    description_html = models.TextField(blank=True, default="<p></p>")
    token = models.CharField(max_length=64, unique=True, db_index=True, default=get_intake_form_token)
    is_enabled = models.BooleanField(default=True)
    default_state = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="intake_forms"
    )
    default_priority = models.CharField(max_length=30, null=True, blank=True)
    default_labels = models.ManyToManyField("db.Label", blank=True, related_name="intake_forms")
    show_priority_field = models.BooleanField(default=True)
    show_labels_field = models.BooleanField(default=True)
    allow_attachments = models.BooleanField(default=False)
    max_attachments = models.PositiveSmallIntegerField(default=5)
    require_submitter_name = models.BooleanField(default=False)
    require_submitter_email = models.BooleanField(default=False)
    send_confirmation_email = models.BooleanField(default=False)
    success_message = models.TextField(blank=True, default="Thank you, your submission has been received.")
    redirect_url = models.URLField(blank=True, null=True)
    rate_limit_per_ip_per_hour = models.PositiveIntegerField(
        default=10, validators=[MinValueValidator(1), MaxValueValidator(1000)]
    )

    class Meta:
        verbose_name = "Intake Form"
        verbose_name_plural = "Intake Forms"
        db_table = "intake_forms"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.project_id}>"


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
    # First time this intake issue's status moved away from Pending (-2) to
    # anything else - the "triage time" metric's end timestamp (start
    # timestamp is `created_at`, already free). Never overwritten once set -
    # see IntakeIssueViewSet.partial_update. Used by the cross-workspace
    # duration-percentiles analytics endpoint - see
    # docs/feature-specs/05-insights-analytics.md, section 2.
    triaged_at = models.DateTimeField(null=True, blank=True)
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
    # Moteur de règles de triage conditionnelles - see
    # docs/feature-specs/02-cycles-intake.md in plane-selfhost.
    applied_triage_rule = models.ForeignKey(
        "db.TriageRule",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applied_intake_issues",
    )
    triage_rule_snapshot = models.JSONField(null=True, blank=True)
    # Formulaire web public d'intake - see
    # docs/feature-specs/02-cycles-intake.md in plane-selfhost.
    intake_form = models.ForeignKey(
        "db.IntakeForm", on_delete=models.SET_NULL, null=True, blank=True, related_name="submissions"
    )
    submitter_name = models.CharField(max_length=255, null=True, blank=True)
    submitter_email = models.EmailField(null=True, blank=True)
    # Hash of the submitter's IP (never the raw IP) - used for abuse
    # analysis without retaining PII beyond what's needed for rate limiting.
    submitter_ip_hash = models.CharField(max_length=64, null=True, blank=True)
    # Intake omnicanal (email + Slack-to-issue) - SKELETON, see
    # docker/api/omnichannel-intake-skeleton/README.md in plane-selfhost.
    external_thread_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    external_participant_meta = models.JSONField(default=list, blank=True)

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
