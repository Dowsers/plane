# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytz
from typing import Optional, Any

# Django imports
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
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


class DuplicateDetectionScope(models.TextChoices):
    """Exigence 2, docs/feature-specs/09-ai-features.md ("2. Detection de
    doublons/similarite") in plane-selfhost - "workspace entier" is an
    explicit opt-in, disabled (project-scoped) by default for performance
    and cross-project-relevance reasons the spec itself calls out."""

    PROJECT = "project", "Current project only"
    WORKSPACE = "workspace", "Entire workspace"


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

    # Master switch for category 9 feature 2 - "Detection de
    # doublons/similarite" (docs/feature-specs/09-ai-features.md, exigence
    # 10, in plane-selfhost). Opt-in (default False), same
    # inherit/override convention as is_ai_triage_enabled above - see
    # `Project.is_duplicate_detection_enabled` and
    # `plane.utils.issue_duplicate_detection.is_duplicate_detection_enabled_for_project`.
    is_duplicate_detection_enabled = models.BooleanField(default=False)
    # Exigence 3 - cosine-similarity cutoff below which a candidate is not
    # surfaced at all. Workspace-level only (no project override - only the
    # on/off switch is overridable per project, matching this fork's
    # decision to keep the tri-state pattern narrow).
    duplicate_detection_similarity_threshold = models.FloatField(default=0.82)
    # Exigence 2 - see DuplicateDetectionScope above.
    duplicate_detection_scope = models.CharField(
        max_length=20,
        choices=DuplicateDetectionScope.choices,
        default=DuplicateDetectionScope.PROJECT,
    )

    # Category 9 feature 5 - "Digest periodique automatise"
    # (docs/feature-specs/09-ai-features.md, exigence 13, in
    # plane-selfhost). Kill-switch, ON by default (unlike every other
    # category 9 opt-in flag) - an individual user's digest still requires
    # their own `DigestPreference.is_enabled=True` to actually receive
    # anything, so a workspace defaulting to "not blocked" is safe. When
    # False, `plane.bgtasks.digest_task.enqueue_due_digests` schedules no
    # generation task for this workspace's members at all, regardless of
    # their individual preferences.
    digest_feature_enabled = models.BooleanField(default=True)
    # Gates the optional "resume enrichi par LLM" mode (exigence 12) -
    # only meaningful if a `WorkspaceAIConfig`
    # (plane.db.models.ai_config) is ALSO configured and enabled for this
    # workspace. If this is True but no enabled `WorkspaceAIConfig`
    # exists, digest generation silently stays in TEMPLATE mode, never
    # errors - see `plane.utils.digest_content.render_digest`.
    is_digest_llm_enrichment_enabled = models.BooleanField(default=False)

    # Master switch for category 9 feature 3 - "Assistant de chat IA
    # in-app" (docs/feature-specs/09-ai-features.md, exigence 10/11, in
    # plane-selfhost). Opt-in (default False), same flat-boolean/inherit-
    # override convention as is_ai_triage_enabled/
    # is_duplicate_detection_enabled above (NOT the spec's own
    # WorkspaceAIConfig/ProjectAIConfig duplicate models) - see
    # `Project.is_ai_assistant_enabled` for the per-project override and
    # `plane.utils.ai_chat_assistant.is_ai_assistant_enabled_for_project`
    # for the inheritance resolution. Both this AND an enabled
    # `WorkspaceAIConfig` (plane.db.models.ai_config) are required before
    # the assistant is reachable at all (exigence 10).
    is_ai_assistant_enabled = models.BooleanField(default=False)
    # Exigence 12 - per-(user, workspace) hourly cap on
    # `POST .../ai-conversations/<id>/messages/`, enforced by
    # `plane.throttles.ai_chat_message.AIChatMessageThrottle`. Same
    # admin-configurable-field convention as
    # `ai_update_daily_generation_limit` above, just per-user rather than
    # per-workspace (exigence 12's own wording - "par utilisateur et par
    # workspace" - a shared workspace-wide budget would let one chatty
    # member starve everyone else).
    ai_assistant_max_messages_per_user_per_hour = models.PositiveIntegerField(default=20)

    # Settings > Wiki toggle for category 10, feature 4 ("Wiki workspace en
    # GA") - see docs/feature-specs/10-docs-wiki.md ("4. Wiki workspace en
    # GA", exigence 4) in plane-selfhost. Flat field directly on Workspace,
    # same convention as every other per-workspace toggle above (no
    # satellite `WorkspaceSetting` model exists anywhere in this fork).
    # Governs ROOT creation only (a page or Collection created with no
    # `collection_id`/`parent`) - creating inside an existing Collection
    # only ever needs ordinary Member+ workspace access, per the exigence's
    # own wording. ADMIN can always create at the root regardless of this
    # value; MEMBER can only do so when this is "MEMBER" (the default).
    WIKI_ROOT_CREATION_ADMIN = "ADMIN"
    WIKI_ROOT_CREATION_MEMBER = "MEMBER"
    WIKI_ROOT_CREATION_ROLE_CHOICES = (
        (WIKI_ROOT_CREATION_ADMIN, "Admin"),
        (WIKI_ROOT_CREATION_MEMBER, "Member"),
    )
    wiki_root_creation_role = models.CharField(
        max_length=10,
        choices=WIKI_ROOT_CREATION_ROLE_CHOICES,
        default=WIKI_ROOT_CREATION_MEMBER,
    )

    # Settings > Features "Mode hors ligne (beta)" toggle for category 12,
    # feature 4 ("Moteur de synchronisation local-first/offline pour le
    # web", docs/feature-specs/12-keyboard-mobile-desktop.md, "Parametre de
    # rollout" in plane-selfhost). Opt-in (default False), same flat-
    # boolean-directly-on-Workspace convention as is_initiatives_enabled/
    # is_roadmap_enabled/is_flexible_query_enabled above - this feature's
    # own backend half (IdempotencyKey replay + the workspace sync/
    # accessible-ids endpoints) works unconditionally regardless of this
    # flag; this is purely the frontend's progressive-rollout gate (the
    # sync engine, its worker, and its IndexedDB cache are only booted
    # client-side when this is True for the active workspace) - added
    # alongside the frontend half of this feature since the spec's own
    # "Considerations API/UX" section scopes the rollout toggle as a
    # frontend concern with no dedicated backend model, and this fork's
    # existing WorkspaceSerializer already exposes/accepts every flat
    # Workspace field generically (`fields = "__all__"`), so no serializer/
    # view change is needed beyond this field + its migration.
    is_offline_sync_enabled = models.BooleanField(default=False)

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
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 6 ("Politiques de securite configurables"),
    # exigence 7 - idle-timeout tracking for `WorkspaceSecurityPolicy.
    # session_timeout_minutes`. See `plane.utils.session_activity`'s own
    # module docstring for the full design/limits - short version: Plane's
    # Django session cookie is issued once per browser/app-context, NOT
    # per-workspace, so it cannot itself express "different idle timeout
    # per workspace" for a user who belongs to several. This field (one row
    # already exists per (workspace, member) pair) is bumped on every
    # authenticated request scoped to `/api/workspaces/<slug>/...` and
    # compared against that workspace's own effective timeout - it never
    # touches the underlying Django session, so exceeding it blocks THIS
    # workspace's API calls only, not other workspaces the same browser
    # session might still be looking at.
    last_workspace_activity_at = models.DateTimeField(null=True, blank=True)
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 2 ("SCIM 2.0 natif"), exigence 8 - the
    # IdP-side `externalId` for this membership, stored/indexed so a SCIM
    # PATCH/DELETE/GET-by-filter can resolve this row without depending on
    # `member.email` alone (an IdP's own internal id for a user is more
    # stable than its email across some directory reorganizations).
    # Deliberately scoped to `WorkspaceMember` (not `User`) - the SAME
    # global `User` can in principle be provisioned into more than one
    # workspace by two unrelated SCIM connections (two different IdPs, or
    # the same IdP configured twice), each with its own `externalId`.
    scim_external_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    # Marks a membership whose lifecycle is SCIM-driven (exigence 3's own
    # "distinguer dans l'UI les membres invites manuellement" wording) -
    # read only by the (separate, frontend) member-management UI to warn
    # an Admin before a manual role/removal change on a SCIM-managed row;
    # this backend never itself blocks a manual change based on this flag.
    scim_managed = models.BooleanField(default=False)
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 4 ("Constructeur de roles personnalises").
    # `on_delete=PROTECT` per exigence 7 - a `WorkspaceRole` held by >=1
    # member can never be deleted (the view layer also pre-checks this to
    # return a friendly 400 with the real member count instead of ever
    # letting a raw `ProtectedError` surface). `null=True` - out-of-scope
    # legacy call sites (~25 inline rank comparisons, decision #5) keep
    # reading the plain `role` integer below regardless of whether this
    # is set; a null `custom_role` is resolved transparently at read time
    # by `plane.utils.rbac.resolve_effective_role` as "whichever of this
    # workspace's 3 system roles matches `role`'s legacy value" - so every
    # WorkspaceMember creation call site NOT explicitly touched by this
    # feature (invite-accept, bot creation, SCIM provisioning, god-mode
    # workspace creation) stays correct with zero write, only the ONE real
    # role-mutating call site this feature does touch
    # (`WorkSpaceMemberViewSet.partial_update`) ever needs to keep both
    # fields in sync explicitly (no Django signal, decision #2).
    custom_role = models.ForeignKey(
        "db.WorkspaceRole",
        related_name="members",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )

    class Meta:
        unique_together = ["workspace", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_member_unique_workspace_member_when_deleted_at_null",
            ),
            # Exigence 8 data-model section - "Contrainte unique_together
            # sur (workspace, scim_external_id) lorsque non nul". A
            # partial `UniqueConstraint` (not a plain `unique_together`,
            # which cannot express "only when non-null" in a
            # cross-database-portable way) - same pattern this category
            # already used for `deleted_at__isnull=True` above.
            models.UniqueConstraint(
                fields=["workspace", "scim_external_id"],
                condition=models.Q(scim_external_id__isnull=False),
                name="workspace_member_unique_workspace_scim_external_id_when_set",
            ),
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


class TeamMember(BaseModel):
    """Team member model - links users to teams"""
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="team_members"
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_teams"
    )
    role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES, default=15)

    class Meta:
        unique_together = ["team", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="team_member_unique_team_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Team Member"
        verbose_name_plural = "Team Members"
        db_table = "team_members"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.member.email} <{self.team.name}>"


class TeamProject(BaseModel):
    """Links teams to projects"""
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="team_projects"
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="project_teams"
    )

    class Meta:
        unique_together = ["team", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="team_project_unique_team_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Team Project"
        verbose_name_plural = "Team Projects"
        db_table = "team_projects"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project.name} <{self.team.name}>"


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


# Category 11 (docs/feature-specs/11-admin-security-sso.md in
# plane-selfhost), feature 6 - "Politiques de securite configurables".
# Builds on the already-shipped Owner mechanics from features 3+5
# (`Workspace.owner`, `IsWorkspaceOwner`, `WorkspaceAuditLog`) rather than
# introducing a parallel notion of ownership.


class MemberInviteRestriction(models.TextChoices):
    """Exigence 5 - who may create a `WorkspaceMemberInvite`."""

    OWNER_ONLY = "OWNER_ONLY", "Owner only"
    ADMINS_AND_ABOVE = "ADMINS_AND_ABOVE", "Admins and above"
    ADMINS_AND_MEMBERS = "ADMINS_AND_MEMBERS", "Admins and Members"


class AllowedAuthMethod(models.TextChoices):
    """The 4 login methods this fork supports (exigence 2's own model
    description) - a subset of these, cross-validated at write time
    (application-level only, per the spec's own wording) against the
    instance-level god-mode flags (`ENABLE_EMAIL_PASSWORD`,
    `ENABLE_MAGIC_LINK_LOGIN`, `IS_GOOGLE_ENABLED`, `IS_GITHUB_ENABLED`),
    is what a workspace Owner may offer their own members."""

    EMAIL_PASSWORD = "EMAIL_PASSWORD", "Email / Password"
    MAGIC_LINK = "MAGIC_LINK", "Magic Link / OTP"
    GOOGLE = "GOOGLE", "Google OAuth"
    GITHUB = "GITHUB", "GitHub OAuth"


def get_default_allowed_auth_methods():
    return [choice.value for choice in AllowedAuthMethod]


class WorkspaceSecurityPolicy(BaseModel):
    """One row per workspace, created lazily (via the security-policy
    endpoint's own get-or-create, see
    `plane.app.views.workspace.security.WorkspaceSecurityPolicyEndpoint`) -
    a workspace with no row yet behaves exactly as if every field were at
    its model default below (no enforcement of any kind).

    NOTE on `updated_by`: the spec's own "Implications sur le modele de
    donnees" section asks for an explicit `updated_by` FK "en plus des
    champs d'audit standards" - but `BaseModel` (via `AuditModel`, see
    `plane.db.mixins`) already provides exactly that: `updated_by` is set
    automatically at save time from `crum.get_current_user()` (the
    request-bound current user), matching every other model in this
    codebase. Adding a second, separately-named FK with the identical
    purpose would just be two sources of truth that could drift - this
    intentionally reuses the mixin's own field rather than shadowing it.
    """

    workspace = models.OneToOneField(
        "db.Workspace", on_delete=models.CASCADE, related_name="security_policy"
    )
    # Exigence 3/4/10.
    enforce_sso_only = models.BooleanField(default=False)
    # Exigence 5.
    member_invite_restriction = models.CharField(
        max_length=32,
        choices=MemberInviteRestriction.choices,
        default=MemberInviteRestriction.ADMINS_AND_ABOVE,
    )
    # Exigence 2's own model description - subset of the instance-enabled
    # methods this workspace's members may use. Defaults to "all 4", i.e.
    # no additional restriction beyond whatever the instance itself allows,
    # until an Owner deliberately narrows it.
    allowed_auth_methods = ArrayField(
        models.CharField(max_length=32, choices=AllowedAuthMethod.choices),
        default=get_default_allowed_auth_methods,
        blank=True,
    )
    # Exigence 7 - null means "use the instance default/ceiling", see
    # `plane.utils.session_activity`.
    session_timeout_minutes = models.PositiveIntegerField(null=True, blank=True)
    # Exigence 8.
    force_reauth_for_sensitive_actions = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Workspace Security Policy"
        verbose_name_plural = "Workspace Security Policies"
        db_table = "workspace_security_policies"
        ordering = ("-created_at",)

    def __str__(self):
        return f"Security Policy <{self.workspace_id}>"


class DomainVerificationMethod(models.TextChoices):
    """Exigence 2 - proof mechanism for a claimed domain. Shared, per
    decision #3, with the future SAML feature's own `SAMLVerifiedDomain` via
    `plane.utils.domain_verification`, which is written model-agnostic on
    purpose so it never has to know about this specific enum - callers pass
    the plain string value through."""

    DNS_TXT = "DNS_TXT", "DNS TXT record"
    HTML_FILE = "HTML_FILE", "HTML file upload"


class WorkspaceVerifiedDomain(BaseModel):
    """A workspace's claim over an email domain, proven (or not yet proven)
    via `plane.utils.domain_verification`. Deliberately NOT globally unique
    on `domain` alone - confirmed by this initiative's own pre-build
    research that two different workspaces on the same self-hosted instance
    may legitimately, independently verify the same domain string (e.g. two
    unrelated teams both self-hosting under one instance while sharing a
    corporate email domain in test/staging data) - only
    `unique_together(workspace, domain)` is enforced. Consumers that key
    security decisions off "is this domain verified" (the SSO-enforcement
    check in `plane.authentication.provider.credentials`) MUST always scope
    by `workspace` too, never treat a bare verified `domain` string as
    globally authoritative - see that module's own docstring for the
    non-leakage guarantee this implies.
    """

    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="verified_domains"
    )
    domain = models.CharField(max_length=255, db_index=True)
    verification_method = models.CharField(max_length=16, choices=DomainVerificationMethod.choices)
    verification_token = models.CharField(max_length=64)
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ["workspace", "domain", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "domain"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_verified_domain_unique_workspace_domain_when_deleted_at_null",
            )
        ]
        indexes = [models.Index(fields=["workspace"])]
        verbose_name = "Workspace Verified Domain"
        verbose_name_plural = "Workspace Verified Domains"
        db_table = "workspace_verified_domains"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self.domain:
            self.domain = self.domain.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.domain} <{self.workspace_id}> verified={self.is_verified}"
