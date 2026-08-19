# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytz
from typing import Optional, Any

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

# Module imports
from .base import BaseModel
from plane.utils.constants import RESTRICTED_WORKSPACE_SLUGS
from plane.utils.color import get_random_color

ROLE_CHOICES = ((20, "Admin"), (15, "Member"), (5, "Guest"))


class WorkspaceAIUpdateDataScope(models.TextChoices):
    """Exigence 12, docs/feature-specs/09-ai-features.md ("6. Redaction
    assistee des mises a jour de statut") in plane-selfhost - how much issue
    detail is sent to the external LLM provider when drafting a
    `ProjectUpdate`. Default never sends full descriptions or any PII beyond
    assignee display names already visible in the workspace.
    """

    TITLES_STATES_ONLY = "TITLES_STATES_ONLY", "Titles, states, and assignees only"
    FULL_DESCRIPTIONS = "FULL_DESCRIPTIONS", "Titles, states, assignees, and full descriptions"


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
        "display_properties": {
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
        },
    }


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
        "display_filters": {
            "group_by": None,
            "order_by": "-created_at",
            "type": None,
            "sub_issue": True,
            "show_empty_groups": True,
            "layout": "list",
            "calendar_date_range": "",
        }
    }


def get_default_display_properties():
    return {
        "display_properties": {
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
    }


def get_issue_props():
    return {"subscribed": True, "assigned": True, "created": True, "all_issues": True}


def slug_validator(value):
    if value in RESTRICTED_WORKSPACE_SLUGS:
        raise ValidationError("Slug is not valid")


class Workspace(BaseModel):
    TIMEZONE_CHOICES = tuple(zip(pytz.common_timezones, pytz.common_timezones))

    name = models.CharField(max_length=80, verbose_name="Workspace Name")
    logo = models.TextField(verbose_name="Logo", blank=True, null=True)
    logo_asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.SET_NULL,
        related_name="workspace_logo",
        blank=True,
        null=True,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_workspace",
    )
    slug = models.SlugField(max_length=48, db_index=True, unique=True, validators=[slug_validator])
    organization_size = models.CharField(max_length=20, blank=True, null=True)
    timezone = models.CharField(max_length=255, default="UTC", choices=TIMEZONE_CHOICES)
    background_color = models.CharField(max_length=255, default=get_random_color)
    # Settings > Features toggle for the Initiatives nav item - see
    # docs/feature-specs/03-projects-roadmaps-initiatives.md in
    # plane-selfhost. Opt-in (default False) so existing workspaces don't
    # suddenly gain a new top-level nav item after migration.
    is_initiatives_enabled = models.BooleanField(default=False)
    # Settings > Features toggle for the workspace Roadmap nav item - see
    # docs/feature-specs/03-projects-roadmaps-initiatives.md ("Roadmap/
    # Timeline cross-projet") in plane-selfhost. Opt-in (default False), same
    # reasoning as is_initiatives_enabled above.
    is_roadmap_enabled = models.BooleanField(default=False)
    # Per-workspace on/off switch for the flexible query endpoint - see
    # docs/feature-specs/08-api-webhooks-cli.md ("Couche de requetes
    # flexible facon GraphQL") in plane-selfhost. Opt-in (default False),
    # same reasoning as is_initiatives_enabled/is_roadmap_enabled above -
    # this is the per-workspace half of the gate; the other half is the
    # instance-wide `FLEXIBLE_QUERY_ENABLED` env var (settings.py), which
    # takes priority (the endpoint 404s outright if that is unset,
    # regardless of this field). Deliberately kept as a flat boolean
    # directly on Workspace, matching this exact convention, rather than
    # folded into WorkspaceQuerySettings below - only the *numeric* quota
    # knobs (max_depth/max_cost/timeout_ms), which have no flat-boolean
    # precedent in this codebase, live in that separate model.
    is_flexible_query_enabled = models.BooleanField(default=False)
    # Settings > AI toggle for the "Resume IA de fils de discussion" (AI
    # thread summary) feature - see
    # docs/feature-specs/09-ai-features.md ("4. Resume IA de fils de
    # discussion", exigence 6) in plane-selfhost. Opt-in (default False),
    # same reasoning/convention as is_initiatives_enabled/is_roadmap_enabled/
    # is_flexible_query_enabled above - a flat boolean directly on Workspace
    # rather than a satellite model, since the only extra "config" this
    # feature needs beyond the shared WorkspaceAIConfig connection
    # (plane.db.models.ai_config) is this single on/off switch. Both this
    # flag AND a `WorkspaceAIConfig` with `is_enabled=True` are required
    # before a summary can be generated - see
    # plane.app.views.issue_comment_summary.
    is_ai_summary_enabled = models.BooleanField(default=False)
    # Settings > AI toggle for AI-assisted status update drafting - see
    # docs/feature-specs/09-ai-features.md ("6. Redaction assistee des
    # mises a jour de statut") in plane-selfhost. PROJECT-ONLY in this fork
    # (see plane.utils.project_update_ai_draft module docstring) - despite
    # the spec wanting Cycle/Module too, no CycleUpdate/ModuleUpdate model
    # exists here. Opt-in (default False), same reasoning/convention as
    # is_ai_summary_enabled above - a flat boolean, requiring both this flag
    # AND an enabled WorkspaceAIConfig before generation is allowed.
    is_ai_update_draft_enabled = models.BooleanField(default=False)
    # Exigence 12 - see WorkspaceAIUpdateDataScope above.
    ai_update_data_scope = models.CharField(
        max_length=30,
        choices=WorkspaceAIUpdateDataScope.choices,
        default=WorkspaceAIUpdateDataScope.TITLES_STATES_ONLY,
    )
    # Exigence 9 - max AI generations per unpublished draft-editing cycle.
    # See plane.utils.project_update_ai_draft for the cache-based counting
    # mechanism (no DB row exists to count against before a ProjectUpdate is
    # published).
    max_ai_update_regenerations = models.PositiveSmallIntegerField(default=5)
    # Exigence 11 - per-workspace daily cap on generation calls, enforced by
    # plane.throttles.project_update_ai_draft.ProjectUpdateAIDraftThrottle.
    ai_update_daily_generation_limit = models.PositiveIntegerField(default=50)
    # Master switch for category 9 feature 1 - "Auto-triage assiste par IA"
    # (docs/feature-specs/09-ai-features.md, exigence 12/13, in
    # plane-selfhost). Opt-in (default False), same convention/reasoning as
    # is_ai_summary_enabled/is_ai_update_draft_enabled above. A project's
    # own `Project.is_ai_triage_enabled` only matters if this is ALSO True -
    # see plane.utils.issue_triage_suggestion.is_ai_triage_enabled_for_project
    # for the inheritance resolution (a project value of `None` inherits
    # this workspace value; an explicit per-project `True`/`False` overrides
    # it, but only ever narrows access - it can never turn triage on for a
    # project if this master switch itself is off).
    is_ai_triage_enabled = models.BooleanField(default=False)

    def __str__(self):
        """Return name of the Workspace"""
        return self.name

    def save(self, *args, **kwargs):
        # Exigence 11 (docs/feature-specs/09-ai-features.md "7. Type
        # d'acteur agent de premiere classe" in plane-selfhost): an agent
        # can never become a workspace owner. This is deliberately a thin,
        # model-level guard rather than endpoint-level plumbing - `owner`
        # is in `read_only_fields` on every workspace serializer and no
        # endpoint in this codebase writes it after creation (the only
        # writer is `WorkSpaceViewSet.create`, always `owner=request.user`,
        # and a bot can never hold a session per the auth-adapter guard in
        # `plane.authentication.adapter.base.Adapter.complete_login_or_signup`)
        # - so this path is dormant today, but cheap insurance against a
        # future direct-ORM ownership-transfer feature.
        if self.owner_id is not None:
            from .user import BotTypeEnum

            owner_is_agent = getattr(self.owner, "is_bot", False) and getattr(
                self.owner, "bot_type", None
            ) == BotTypeEnum.WORKSPACE_AGENT
            if owner_is_agent:
                raise ValidationError("An agent cannot be set as workspace owner.")
        super().save(*args, **kwargs)

    @property
    def logo_url(self):
        # Return the logo asset url if it exists
        if self.logo_asset:
            return self.logo_asset.asset_url

        # Return the logo url if it exists
        if self.logo:
            return self.logo
        return None

    def delete(self, using: Optional[str] = None, soft: bool = True, *args: Any, **kwargs: Any):
        """
        Override the delete method to append epoch timestamp to the slug when soft deleting.

        Args:
            using: The database alias to use for the deletion.
            soft: Whether to perform a soft delete (True) or hard delete (False).
            *args: Additional positional arguments.
            **kwargs: Additional keyword arguments.
        """
        # Call the parent class's delete method first
        result = super().delete(using=using, soft=soft, *args, **kwargs)

        # If it's a soft delete and the model still exists (not hard deleted)
        if soft and hasattr(self, "deleted_at") and self.deleted_at:
            # Use the deleted_at timestamp to update the slug
            deletion_timestamp: int = int(self.deleted_at.timestamp())
            self.slug = f"{self.slug}__{deletion_timestamp}"
            self.save(update_fields=["slug"])

        return result

    class Meta:
        verbose_name = "Workspace"
        verbose_name_plural = "Workspaces"
        db_table = "workspaces"
        ordering = ("-created_at",)


class WorkspaceBaseModel(BaseModel):
    workspace = models.ForeignKey("db.Workspace", models.CASCADE, related_name="workspace_%(class)s")
    project = models.ForeignKey("db.Project", models.CASCADE, related_name="project_%(class)s", null=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.project:
            self.workspace = self.project.workspace
        super(WorkspaceBaseModel, self).save(*args, **kwargs)


class WorkspaceMember(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_member")
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="member_workspace",
    )
    role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES, default=5)
    company_role = models.TextField(null=True, blank=True)
    view_props = models.JSONField(default=get_default_props)
    default_props = models.JSONField(default=get_default_props)
    issue_props = models.JSONField(default=get_issue_props)
    is_active = models.BooleanField(default=True)
    getting_started_checklist = models.JSONField(default=dict)
    tips = models.JSONField(default=dict)
    explored_features = models.JSONField(default=dict)

    class Meta:
        unique_together = ["workspace", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_member_unique_workspace_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Member"
        verbose_name_plural = "Workspace Members"
        db_table = "workspace_members"
        ordering = ("-created_at",)

    def __str__(self):
        """Return members of the workspace"""
        return f"{self.member.email} <{self.workspace.name}>"


class WorkspaceMemberInvite(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_member_invite")
    email = models.CharField(max_length=255)
    accepted = models.BooleanField(default=False)
    token = models.CharField(max_length=255)
    message = models.TextField(null=True)
    responded_at = models.DateTimeField(null=True)
    role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES, default=5)

    class Meta:
        unique_together = ["email", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["email", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_member_invite_unique_email_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Member Invite"
        verbose_name_plural = "Workspace Member Invites"
        db_table = "workspace_member_invites"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.name} {self.email} {self.accepted}"


class Team(BaseModel):
    name = models.CharField(max_length=255, verbose_name="Team Name")
    description = models.TextField(verbose_name="Team Description", blank=True)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="workspace_team")
    logo_props = models.JSONField(default=dict)

    def __str__(self):
        """Return name of the team"""
        return f"{self.name} <{self.workspace.name}>"

    class Meta:
        unique_together = ["name", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="team_unique_name_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Team"
        verbose_name_plural = "Teams"
        db_table = "teams"
        ordering = ("-created_at",)


class WorkspaceTheme(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="themes")
    name = models.CharField(max_length=300)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="themes")
    colors = models.JSONField(default=dict)

    def __str__(self):
        return str(self.name) + str(self.actor.email)

    class Meta:
        unique_together = ["workspace", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_theme_unique_workspace_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Theme"
        verbose_name_plural = "Workspace Themes"
        db_table = "workspace_themes"
        ordering = ("-created_at",)


class WorkspaceUserProperties(BaseModel):
    class NavigationControlPreference(models.TextChoices):
        ACCORDION = "ACCORDION", "Accordion"
        TABBED = "TABBED", "Tabbed"

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_user_properties",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_user_properties",
    )
    filters = models.JSONField(default=get_default_filters)
    display_filters = models.JSONField(default=get_default_display_filters)
    display_properties = models.JSONField(default=get_default_display_properties)
    rich_filters = models.JSONField(default=dict)
    navigation_project_limit = models.IntegerField(default=10)
    navigation_control_preference = models.CharField(
        max_length=25,
        choices=NavigationControlPreference.choices,
        default=NavigationControlPreference.ACCORDION,
    )

    class Meta:
        unique_together = ["workspace", "user", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_user_properties_unique_workspace_user_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace User Property"
        verbose_name_plural = "Workspace User Property"
        db_table = "workspace_user_properties"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.name} {self.user.email}"


class WorkspaceUserLink(WorkspaceBaseModel):
    title = models.CharField(max_length=255, null=True, blank=True)
    url = models.TextField()
    metadata = models.JSONField(default=dict)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_workspace_user_link",
    )

    class Meta:
        verbose_name = "Workspace User Link"
        verbose_name_plural = "Workspace User Links"
        db_table = "workspace_user_links"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.id} {self.url}"


class WorkspaceHomePreference(BaseModel):
    """Preference for the home page of a workspace for a user"""

    class HomeWidgetKeys(models.TextChoices):
        QUICK_LINKS = "quick_links", "Quick Links"
        RECENTS = "recents", "Recents"
        MY_STICKIES = "my_stickies", "My Stickies"
        NEW_AT_PLANE = "new_at_plane", "New at Plane"
        QUICK_TUTORIAL = "quick_tutorial", "Quick Tutorial"

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_user_home_preferences",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_user_home_preferences",
    )
    key = models.CharField(max_length=255)
    is_enabled = models.BooleanField(default=True)
    config = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["workspace", "user", "key", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user", "key"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_user_home_preferences_unique_workspace_user_key_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Home Preference"
        verbose_name_plural = "Workspace Home Preferences"
        db_table = "workspace_home_preferences"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.name} {self.user.email} {self.key}"


class WorkspaceUserPreference(BaseModel):
    """Preference for the workspace for a user"""

    class UserPreferenceKeys(models.TextChoices):
        VIEWS = "views", "Views"
        ACTIVE_CYCLES = "active_cycles", "Active Cycles"
        ANALYTICS = "analytics", "Analytics"
        DRAFTS = "drafts", "Drafts"
        YOUR_WORK = "your_work", "Your Work"
        ARCHIVES = "archives", "Archives"
        STICKIES = "stickies", "Stickies"

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_user_preferences",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_user_preferences",
    )
    key = models.CharField(max_length=255)
    is_pinned = models.BooleanField(default=False)
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["workspace", "user", "key", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user", "key"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_user_preferences_unique_workspace_user_key_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace User Preference"
        verbose_name_plural = "Workspace User Preferences"
        db_table = "workspace_user_preferences"
        ordering = ("-created_at",)
