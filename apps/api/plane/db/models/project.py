# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytz
from uuid import uuid4
from enum import Enum

# Django imports
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

# Module imports
from plane.db.mixins import AuditModel

from .base import BaseModel

ROLE_CHOICES = ((20, "Admin"), (15, "Member"), (5, "Guest"))


class ROLE(Enum):
    ADMIN = 20
    MEMBER = 15
    GUEST = 5


class ProjectNetwork(Enum):
    SECRET = 0
    PUBLIC = 2

    @classmethod
    def choices(cls):
        return [(0, "Secret"), (2, "Public")]


def get_default_props():
    return {
        "filters": {
            "priority": None,
            "state": None,
            "state_group": None,
            "assignees": None,
            "created_by": None,
            "labels": None,
            "start_date": None,
            "target_date": None,
            "subscriber": None,
        },
        "display_filters": {
            "group_by": None,
            "order_by": "-created_at",
            "type": None,
            "sub_issue": True,
            "show_empty_groups": True,
            "layout": "list",
            "calendar_date_range": "",
        },
    }


def get_default_preferences():
    return {"pages": {"block_display": True}, "navigation": {"default_tab": "work_items", "hide_in_more_menu": []}}


class Project(BaseModel):
    NETWORK_CHOICES = ((0, "Secret"), (2, "Public"))
    name = models.CharField(max_length=255, verbose_name="Project Name")
    description = models.TextField(verbose_name="Project Description", blank=True)
    description_text = models.JSONField(verbose_name="Project Description RT", blank=True, null=True)
    description_html = models.JSONField(verbose_name="Project Description HTML", blank=True, null=True)
    network = models.PositiveSmallIntegerField(default=2, choices=NETWORK_CHOICES)
    workspace = models.ForeignKey("db.WorkSpace", on_delete=models.CASCADE, related_name="workspace_project")
    identifier = models.CharField(max_length=12, verbose_name="Project Identifier", db_index=True)
    default_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="default_assignee",
        null=True,
        blank=True,
    )
    project_lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_lead",
        null=True,
        blank=True,
    )
    emoji = models.CharField(max_length=255, null=True, blank=True)
    icon_prop = models.JSONField(null=True)
    module_view = models.BooleanField(default=False)
    cycle_view = models.BooleanField(default=False)
    issue_views_view = models.BooleanField(default=False)
    page_view = models.BooleanField(default=True)
    intake_view = models.BooleanField(default=False)
    is_time_tracking_enabled = models.BooleanField(default=False)
    is_issue_type_enabled = models.BooleanField(default=False)
    guest_view_all_features = models.BooleanField(default=False)
    # Manually-set health, source of truth for the Initiative rollup - see
    # docs/feature-specs/03-projects-roadmaps-initiatives.md ("Entité
    # Initiatives") in plane-selfhost.
    health = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        choices=(("on-track", "On Track"), ("at-risk", "At Risk"), ("off-track", "Off Track")),
    )
    # Traceability only - a one-time blueprint copy, never a live link back
    # to the template. See
    # docs/feature-specs/03-projects-roadmaps-initiatives.md ("Templates de
    # projet") in plane-selfhost.
    created_from_template = models.ForeignKey(
        "db.ProjectTemplate",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_projects",
    )
    # Structured status update cadence/reminder settings - see
    # docs/feature-specs/03-projects-roadmaps-initiatives.md ("Mises a jour
    # de statut structurees") in plane-selfhost.
    UPDATE_CADENCE_CHOICES = (
        ("DISABLED", "Disabled"),
        ("WEEKLY", "Weekly"),
        ("BIWEEKLY", "Biweekly"),
        ("MONTHLY", "Monthly"),
    )
    update_cadence = models.CharField(max_length=20, choices=UPDATE_CADENCE_CHOICES, default="DISABLED")
    update_reminder_day = models.PositiveSmallIntegerField(null=True, blank=True)
    update_reminder_enabled = models.BooleanField(default=False)
    update_owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="owned_project_updates",
    )
    next_update_due_at = models.DateTimeField(null=True, blank=True)
    # Roadmap/Timeline cross-project fields - see
    # docs/feature-specs/03-projects-roadmaps-initiatives.md ("Roadmap/
    # Timeline cross-projet") in plane-selfhost. Drives the workspace
    # Roadmap Gantt view; does not redefine `health` above, which already
    # exists from the Initiatives feature.
    PRIORITY_CHOICES = (
        ("urgent", "Urgent"),
        ("high", "High"),
        ("medium", "Medium"),
        ("low", "Low"),
        ("none", "None"),
    )
    priority = models.CharField(
        max_length=30,
        choices=PRIORITY_CHOICES,
        verbose_name="Project Priority",
        default="none",
    )
    start_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    cover_image = models.TextField(blank=True, null=True)
    cover_image_asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_cover_image",
    )
    estimate = models.ForeignKey("db.Estimate", on_delete=models.SET_NULL, related_name="projects", null=True)
    archive_in = models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(12)])
    close_in = models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(12)])
    logo_props = models.JSONField(default=dict)
    default_state = models.ForeignKey("db.State", on_delete=models.SET_NULL, null=True, related_name="default_state")
    # Sub-issue lifecycle automations - see docs/feature-specs/01-core-issue-tracking.md
    # ("Automatisations de cycle de vie des sous-tâches") in plane-selfhost.
    sub_issue_auto_close = models.BooleanField(default=False)
    sub_issue_auto_close_state = models.ForeignKey(
        "db.State",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sub_issue_auto_close_projects",
    )
    sub_issue_cascade_close = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True)
    # timezone
    TIMEZONE_CHOICES = tuple(zip(pytz.common_timezones, pytz.common_timezones))
    timezone = models.CharField(max_length=255, default="UTC", choices=TIMEZONE_CHOICES)
    # external_id for imports
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)
    # Rolling window (in closed cycles) used to compute the average/optimistic/
    # pessimistic velocity shown on the project-level "Scope & velocity" chart
    # - see docs/feature-specs/05-insights-analytics.md ("Graphiques de
    # progression cycle/projet", implications sur le modele de donnees) in
    # plane-selfhost.
    velocity_window_size = models.IntegerField(
        default=3, validators=[MinValueValidator(1), MaxValueValidator(12)]
    )

    # --- Category 9 feature 1 - "Auto-triage assiste par IA" project
    # settings (docs/feature-specs/09-ai-features.md in plane-selfhost).
    # Flat fields directly on Project, NOT a satellite "ProjectAITriageConfig"
    # model as the spec's own data-model section proposes - matching this
    # fork's established convention (is_initiatives_enabled/is_roadmap_enabled/
    # is_flexible_query_enabled/is_ai_summary_enabled) of a plain boolean/
    # numeric field directly on the owning model rather than a 1:1 satellite,
    # since nothing here needs its own independent lifecycle or created_at/
    # updated_at beyond Project's own. See
    # plane.utils.issue_triage_suggestion for the logic that reads these.
    #
    # Nullable tri-state (unlike every sibling `is_*_enabled` boolean above,
    # which default False): exigence 12 explicitly wants "une valeur par
    # defaut heritee du reglage workspace" - a real third "inherit" state,
    # not just a False default, so a project that has never touched this
    # setting is indistinguishable from one that explicitly opted out.
    # `None` means "inherit Workspace.is_ai_triage_enabled"; an explicit
    # `True`/`False` overrides the inherited value (but `True` only takes
    # effect if the workspace master switch is also `True` - see
    # is_ai_triage_enabled_for_project).
    is_ai_triage_enabled = models.BooleanField(null=True, blank=True, default=None)
    ai_triage_auto_apply_module = models.BooleanField(default=False)
    ai_triage_auto_apply_assignee = models.BooleanField(default=False)
    ai_triage_auto_apply_labels = models.BooleanField(default=False)
    ai_triage_confidence_threshold_module = models.FloatField(default=0.75)
    ai_triage_confidence_threshold_assignee = models.FloatField(default=0.75)
    ai_triage_confidence_threshold_labels = models.FloatField(default=0.75)
    # Exigence 2 - cap on the number of suggested labels.
    ai_triage_max_labels_suggested = models.PositiveSmallIntegerField(default=5)
    # Exigence 10 - below this many qualified historical issues in the
    # project, no suggestion is generated at all.
    ai_triage_min_historical_issues = models.PositiveIntegerField(default=10)

    def __init__(self, *args, **kwargs):
        # Track if timezone is provided, if so, don't override it with the workspace timezone when saving
        self.is_timezone_provided = kwargs.get("timezone") is not None
        super().__init__(*args, **kwargs)

    @property
    def cover_image_url(self):
        # Return cover image url
        if self.cover_image_asset:
            return self.cover_image_asset.asset_url

        # Return cover image url
        if self.cover_image:
            return self.cover_image

        return None

    def __str__(self):
        """Return name of the project"""
        return f"{self.name} <{self.workspace.name}>"

    FORBIDDEN_IDENTIFIER_CHARS_PATTERN = r"^.*[&+,:;$^}{*=?@#|'<>.()%!-].*$"

    class Meta:
        unique_together = [
            ["identifier", "workspace", "deleted_at"],
            ["name", "workspace", "deleted_at"],
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["identifier", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="project_unique_identifier_workspace_when_deleted_at_null",
            ),
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="project_unique_name_workspace_when_deleted_at_null",
            ),
        ]
        verbose_name = "Project"
        verbose_name_plural = "Projects"
        db_table = "projects"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        from plane.db.models import Workspace

        self.identifier = self.identifier.strip().upper()
        is_creating = self._state.adding

        if is_creating and not self.is_timezone_provided:
            workspace = Workspace.objects.get(id=self.workspace_id)
            self.timezone = workspace.timezone

        return super().save(*args, **kwargs)


class ProjectBaseModel(BaseModel):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="project_%(class)s")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_%(class)s")

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.workspace = self.project.workspace
        super(ProjectBaseModel, self).save(*args, **kwargs)


class ProjectMemberInvite(ProjectBaseModel):
    email = models.CharField(max_length=255)
    accepted = models.BooleanField(default=False)
    token = models.CharField(max_length=255)
    message = models.TextField(null=True)
    responded_at = models.DateTimeField(null=True)
    role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES, default=5)

    class Meta:
        verbose_name = "Project Member Invite"
        verbose_name_plural = "Project Member Invites"
        db_table = "project_member_invites"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project.name} {self.email} {self.accepted}"


class ProjectMember(ProjectBaseModel):
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="member_project",
    )
    comment = models.TextField(blank=True, null=True)
    role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES, default=5)
    view_props = models.JSONField(default=get_default_props)
    default_props = models.JSONField(default=get_default_props)
    preferences = models.JSONField(default=get_default_preferences)
    sort_order = models.FloatField(default=65535)
    is_active = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        if self._state.adding and self.member:
            # Get the minimum sort_order for this member in the workspace
            min_sort_order_result = ProjectUserProperty.objects.filter(
                workspace_id=self.project.workspace_id, user=self.member
            ).aggregate(min_sort_order=models.Min("sort_order"))
            min_sort_order = min_sort_order_result.get("min_sort_order")

            # create project user property with project sort order
            ProjectUserProperty.objects.create(
                workspace_id=self.project.workspace_id,
                project=self.project,
                user=self.member,
                sort_order=(min_sort_order - 10000 if min_sort_order is not None else 65535),
            )

        super(ProjectMember, self).save(*args, **kwargs)

    class Meta:
        unique_together = ["project", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "member"],
                condition=Q(deleted_at__isnull=True),
                name="project_member_unique_project_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Member"
        verbose_name_plural = "Project Members"
        db_table = "project_members"
        ordering = ("-created_at",)

    def __str__(self):
        """Return members of the project"""
        return f"{self.member.email} <{self.project.name}>"


# TODO: Remove workspace relation later
class ProjectIdentifier(AuditModel):
    workspace = models.ForeignKey("db.Workspace", models.CASCADE, related_name="project_identifiers", null=True)
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name="project_identifier")
    name = models.CharField(max_length=12, db_index=True)

    class Meta:
        unique_together = ["name", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="unique_name_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Identifier"
        verbose_name_plural = "Project Identifiers"
        db_table = "project_identifiers"
        ordering = ("-created_at",)


def get_anchor():
    return uuid4().hex


def get_default_views():
    return {
        "list": True,
        "kanban": True,
        "calendar": True,
        "gantt": True,
        "spreadsheet": True,
    }


# DEPRECATED TODO:
# used to get the old anchors for the project deploy boards
class ProjectDeployBoard(ProjectBaseModel):
    anchor = models.CharField(max_length=255, default=get_anchor, unique=True, db_index=True)
    comments = models.BooleanField(default=False)
    reactions = models.BooleanField(default=False)
    intake = models.ForeignKey("db.Intake", related_name="board_intake", on_delete=models.SET_NULL, null=True)
    votes = models.BooleanField(default=False)
    views = models.JSONField(default=get_default_views)

    class Meta:
        unique_together = ["project", "anchor"]
        verbose_name = "Project Deploy Board"
        verbose_name_plural = "Project Deploy Boards"
        db_table = "project_deploy_boards"
        ordering = ("-created_at",)

    def __str__(self):
        """Return project and anchor"""
        return f"{self.anchor} <{self.project.name}>"


class ProjectPublicMember(ProjectBaseModel):
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="public_project_members",
    )

    class Meta:
        unique_together = ["project", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_public_member_unique_project_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Public Member"
        verbose_name_plural = "Project Public Members"
        db_table = "project_public_members"
        ordering = ("-created_at",)


class ProjectUserProperty(ProjectBaseModel):
    from .issue import get_default_filters, get_default_display_filters, get_default_display_properties

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_property_user",
    )
    filters = models.JSONField(default=get_default_filters)
    display_filters = models.JSONField(default=get_default_display_filters)
    display_properties = models.JSONField(default=get_default_display_properties)
    rich_filters = models.JSONField(default=dict)
    preferences = models.JSONField(default=get_default_preferences)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Project User Property"
        verbose_name_plural = "Project User Properties"
        db_table = "project_user_properties"
        ordering = ("-created_at",)
        unique_together = ["user", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "project"],
                condition=Q(deleted_at__isnull=True),
                name="project_user_property_unique_user_project_when_deleted_at_null",
            )
        ]

    def __str__(self):
        """Return properties status of the project"""
        return str(self.user)
