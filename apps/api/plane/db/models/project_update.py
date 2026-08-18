# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .project import ProjectBaseModel


class AIGenerationStatus(models.TextChoices):
    """Shared status choices for a single AI-drafted-update generation
    attempt - used both on `ProjectUpdate.ai_generation_status` (the latest
    attempt behind that update's current draft) and on `AIGenerationLog`
    (one row per attempt, see `plane.db.models.ai_generation_log`).
    """

    PENDING = "PENDING", "Pending"
    SUCCESS = "SUCCESS", "Success"
    FAILED = "FAILED", "Failed"
    TIMEOUT = "TIMEOUT", "Timeout"


class ProjectUpdate(ProjectBaseModel):
    """
    A historized, manually-authored status update for a project (On
    Track/At Risk/Off Track + free text) - see
    docs/feature-specs/03-projects-roadmaps-initiatives.md ("Mises a jour
    de statut structurees") in plane-selfhost. Deliberately a plain
    description_html (Initiative/Milestone's tier), not the collaborative
    quad-field pattern (description_json/_binary/_stripped) used by
    Issue/Page - a project update is authored by a single person at a
    point in time, not co-edited live, so wiring the apps/live Y.js
    service for this entity would be disproportionate.
    """

    class StatusChoice(models.TextChoices):
        ON_TRACK = "ON_TRACK", "On Track"
        AT_RISK = "AT_RISK", "At Risk"
        OFF_TRACK = "OFF_TRACK", "Off Track"

    status = models.CharField(max_length=20, choices=StatusChoice.choices)
    description_html = models.TextField(blank=True, default="<p></p>")
    # Snapshot of the auto-generated "since last update" block at creation
    # time - frozen, never regenerated on edit (exigence 6 de la spec).
    generated_summary_json = models.JSONField(default=dict, blank=True)
    is_summary_edited = models.BooleanField(default=False)

    # AI-assisted drafting fields - category 9 feature 6 ("Redaction
    # assistee des mises a jour de statut", docs/feature-specs/09-ai-features.md
    # in plane-selfhost). PROJECT ONLY in v1 - see
    # plane.utils.project_update_ai_draft module docstring for why
    # Cycle/Module are a deliberate, documented gap rather than an
    # oversight. Publication is unchanged (this endpoint's `create()` still
    # IS publication) - these fields are simply carried through from a
    # generated draft when the human submits the existing manual form.
    is_ai_assisted = models.BooleanField(default=False)
    # Raw generated text, kept verbatim even after the human edits the
    # published description_html - exigence 8's audit/diff requirement.
    ai_draft_content = models.TextField(null=True, blank=True)
    ai_generation_status = models.CharField(
        max_length=20, choices=AIGenerationStatus.choices, null=True, blank=True
    )
    # {llm_provider, llm_model, prompt_tokens, completion_tokens, latency_ms}
    # - see plane.utils.project_update_ai_draft.generate_project_update_draft
    # for the documented prompt_tokens/completion_tokens gap (the shared LLM
    # helper doesn't currently surface provider token usage).
    ai_generation_metadata = models.JSONField(null=True, blank=True)
    # Serialized issue-delta list actually used for this generation -
    # reproducibility/audit (exigence 8).
    ai_source_snapshot = models.JSONField(null=True, blank=True)
    ai_regeneration_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "Project Update"
        verbose_name_plural = "Project Updates"
        db_table = "project_updates"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.status} <{self.project_id}>"


class ProjectUpdateReminder(ProjectBaseModel):
    """
    Idempotency log for the periodic reminder task - one row per due
    date, so a periodic Celery beat task can safely run every few minutes
    without double-sending reminders for the same deadline.
    """

    scheduled_for = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    reminder_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "Project Update Reminder"
        verbose_name_plural = "Project Update Reminders"
        db_table = "project_update_reminders"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project_id} <{self.scheduled_for}>"
