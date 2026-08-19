# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 5 - "Digest periodique automatise" (Linear
"Pulse" equivalent). See `plane.utils.digest_content` for the content
aggregation/rendering logic and `plane.bgtasks.digest_task` for the Celery
beat polling/generation mechanism.

SCOPE DECISIONS ALREADY MADE (see the category 9 progress notes in
plane-selfhost for the full research trail - not re-derived here):

- No new `WorkspaceLLMConfig`/`WorkspaceAIIntegration` model - the shared
  `plane.db.models.ai_config.WorkspaceAIConfig` (built as a category 9
  infrastructure prerequisite, reused by every feature since) is what
  `Workspace.is_digest_llm_enrichment_enabled` gates alongside, via
  `plane.utils.workspace_ai.get_workspace_llm_response`.
- NOT wired into `UserNotificationPreference` at all - that model has no
  master "email enabled" toggle and no existing send-path in this fork
  honors it (even `notify_project_update_published` emails
  unconditionally). Making this feature the first real consumer of a
  model nothing else respects would be disproportionate. `send_email`
  below is this feature's own fully independent toggle.
- `send_audio`/`DigestRun.audio_file` are schema-level placeholders only
  (exigence 11's "point d'extension" - "l'implementation d'un moteur TTS
  est un chantier separe" is explicitly hors-perimetre). No TTS provider
  exists anywhere in this fork (confirmed empirically) - nothing ever sets
  `send_audio=True` from any UI path, and no audio is ever generated.
- `DigestPreference`/`DigestRun` deliberately do NOT use
  `WorkspaceBaseModel` (which would add an unused, nullable `project` FK
  neither model needs) - they use `BaseModel` directly with their own
  explicit `user`/`workspace` FKs, the same shape as
  `plane.db.models.workspace.WorkspaceUserPreference`. `DigestItem` DOES
  use `ProjectBaseModel` since a project FK is a real, required part of
  its own shape (auto-derives `workspace` from `project.workspace`).
"""

from datetime import time

from django.conf import settings
from django.db import models

from .base import BaseModel
from .project import ProjectBaseModel


class DigestFrequency(models.TextChoices):
    DAILY = "DAILY", "Daily"
    WEEKLY = "WEEKLY", "Weekly"


class DigestScope(models.TextChoices):
    ALL_PROJECTS = "ALL_PROJECTS", "All Projects"
    FAVORITES_ONLY = "FAVORITES_ONLY", "Favorites Only"
    CUSTOM = "CUSTOM", "Custom"


class DigestRunStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    GENERATED = "GENERATED", "Generated"
    SENT = "SENT", "Sent"
    SKIPPED_EMPTY = "SKIPPED_EMPTY", "Skipped (Empty)"
    FAILED = "FAILED", "Failed"


class DigestGenerationMethod(models.TextChoices):
    TEMPLATE = "TEMPLATE", "Template"
    LLM = "LLM", "LLM"


class DigestItemType(models.TextChoices):
    ISSUE_CREATED = "ISSUE_CREATED", "Issue Created"
    # Covers both the spec's "completed" and "cancelled" state groups - the
    # spec's own exigence 4 bundles them into one bullet ("issues passees a
    # un etat 'completed'/'cancelled'"), unlike the separate
    # "changements d'etat significatifs" bullet below.
    ISSUE_COMPLETED = "ISSUE_COMPLETED", "Issue Completed"
    ISSUE_STATE_CHANGED = "ISSUE_STATE_CHANGED", "Issue State Changed"
    COMMENT_MENTION = "COMMENT_MENTION", "Comment Mention"
    CYCLE_STARTED = "CYCLE_STARTED", "Cycle Started"
    CYCLE_COMPLETED = "CYCLE_COMPLETED", "Cycle Completed"
    CYCLE_SCOPE_CHANGED = "CYCLE_SCOPE_CHANGED", "Cycle Scope Changed"


class DigestPreference(BaseModel):
    """One row per (user, workspace) - the user's own opt-in digest
    settings. Created on first access (`get_or_create`) by
    `plane.app.views.digest.UserDigestPreferenceEndpoint`, matching this
    fork's `WorkspaceAPIExplorerSettings`/`WorkspaceQuerySettings`
    "settings row that default-creates" convention.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="digest_preferences"
    )
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="digest_preferences"
    )
    # Opt-in (exigence 1) - disabled by default for every user.
    is_enabled = models.BooleanField(default=False)
    frequency = models.CharField(
        max_length=10, choices=DigestFrequency.choices, default=DigestFrequency.DAILY
    )
    # 0-6, Python `date.weekday()` convention (Monday=0 .. Sunday=6) - only
    # meaningful/read when frequency=WEEKLY.
    day_of_week = models.PositiveSmallIntegerField(null=True, blank=True)
    # Local delivery time (exigence 2) - interpreted in `user.user_timezone`
    # by the beat-polling mechanism (`plane.bgtasks.digest_task`).
    time_of_day = models.TimeField(default=time(8, 0))
    scope = models.CharField(
        max_length=20, choices=DigestScope.choices, default=DigestScope.ALL_PROJECTS
    )
    custom_projects = models.ManyToManyField(
        "db.Project", blank=True, related_name="digest_preferences_custom"
    )
    send_in_app = models.BooleanField(default=True)
    send_email = models.BooleanField(default=True)
    # Schema placeholder only - see module docstring. Never set True by any
    # real UI path, never actually used to generate audio.
    send_audio = models.BooleanField(default=False)

    class Meta:
        unique_together = ["user", "workspace"]
        verbose_name = "Digest Preference"
        verbose_name_plural = "Digest Preferences"
        db_table = "digest_preferences"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user_id} <-> {self.workspace_id} digest-preference:{self.frequency}"


class DigestRun(BaseModel):
    """One row per actually-generated (or attempted) digest period for a
    user in a workspace. The `UniqueConstraint` below IS the idempotency
    mechanism (exigence 7) - a real DB-level guarantee, not just an
    app-level `get_or_create` check (though the generation task also uses
    `get_or_create` to turn a constraint violation into a clean no-op
    rather than a raised IntegrityError bubbling out of a Celery task).
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="digest_runs")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="digest_runs")
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    # Snapshot of DigestPreference.frequency at generation time (exigence
    # "duplique depuis la preference au moment de la generation, pour
    # tracabilite") - a later preference change never rewrites history.
    frequency = models.CharField(max_length=10, choices=DigestFrequency.choices)
    status = models.CharField(
        max_length=20, choices=DigestRunStatus.choices, default=DigestRunStatus.PENDING
    )
    generation_method = models.CharField(
        max_length=10, choices=DigestGenerationMethod.choices, default=DigestGenerationMethod.TEMPLATE
    )
    # Rendered, structured content (grouped by project/cycle/type) - see
    # plane.utils.digest_content. Prose phrasing may differ between
    # TEMPLATE/LLM generation_method, but the underlying grouping/structure
    # is the same either way.
    summary_text = models.TextField(blank=True, default="")
    # Schema placeholder only - see module docstring. Never populated today.
    audio_file = models.URLField(max_length=800, null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    item_count = models.IntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "workspace", "period_start", "period_end"],
                name="digest_run_unique_user_workspace_period",
            )
        ]
        verbose_name = "Digest Run"
        verbose_name_plural = "Digest Runs"
        db_table = "digest_runs"
        ordering = ("-period_end",)

    def __str__(self):
        return f"{self.user_id} <-> {self.workspace_id} digest-run:{self.status}"


class DigestItem(ProjectBaseModel):
    """One activity item folded into a `DigestRun`. `payload` is an
    immutable snapshot taken at generation time (issue title, old/new
    state, comment excerpt, etc.) - the item never depends on the
    referenced `issue`/`cycle` still existing or looking the same later,
    per exigence 4's data-model note ("sans dupliquer leur contenu de
    facon permanente... seul un snapshot... est conserve").
    """

    digest_run = models.ForeignKey(DigestRun, on_delete=models.CASCADE, related_name="items")
    cycle = models.ForeignKey(
        "db.Cycle", on_delete=models.SET_NULL, null=True, blank=True, related_name="digest_items"
    )
    issue = models.ForeignKey(
        "db.Issue", on_delete=models.SET_NULL, null=True, blank=True, related_name="digest_items"
    )
    item_type = models.CharField(max_length=30, choices=DigestItemType.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="digest_items_authored",
    )
    payload = models.JSONField(default=dict, blank=True)
    position = models.IntegerField(default=0)

    class Meta:
        verbose_name = "Digest Item"
        verbose_name_plural = "Digest Items"
        db_table = "digest_items"
        ordering = ("digest_run_id", "position")

    def __str__(self):
        return f"{self.digest_run_id} <-> {self.item_type}"
