# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Audit trail for category 9 (AI features, docs/feature-specs/09-ai-features.md
in plane-selfhost) feature 6 - "Redaction assistee des mises a jour de
statut" (AI-assisted status update drafting). Exigence 13: every generation
attempt, successful or failed, must produce an admin-consultable audit row.

PROJECT ONLY in v1 - see `plane.utils.project_update_ai_draft` module
docstring. `project`/`workspace` come from `ProjectBaseModel`, matching the
task's own "Standard ProjectBaseModel-style base" instruction (not the
spec's own WorkspaceBaseModel + entity_type/entity_id polymorphic shape,
which would only make sense if Cycle/Module updates existed here too).

`update` is nullable and, in this v1, always null in practice: generation
never creates a `ProjectUpdate` row (see `project_update_ai_draft`
docstring) - it exists on the model for forward-compatibility if a future
pass wants to explicitly link a log entry to the `ProjectUpdate` it was
eventually published into, but that linking is not implemented here.
"""

from django.conf import settings
from django.db import models

from .ai_config import WorkspaceAIProvider
from .project import ProjectBaseModel
from .project_update import AIGenerationStatus


class AIGenerationLog(ProjectBaseModel):
    update = models.ForeignKey(
        "db.ProjectUpdate", on_delete=models.SET_NULL, null=True, blank=True, related_name="ai_generation_logs"
    )
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="ai_update_generation_logs",
    )
    status = models.CharField(max_length=20, choices=AIGenerationStatus.choices)
    # Nullable - a request that failed before a WorkspaceAIConfig could even
    # be read (shouldn't normally happen, since the view gates on it first,
    # but the model doesn't assume it).
    provider = models.CharField(max_length=30, choices=WorkspaceAIProvider.choices, null=True, blank=True)
    model_name = models.CharField(max_length=255, blank=True, default="")
    token_usage = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "AI Generation Log"
        verbose_name_plural = "AI Generation Logs"
        db_table = "ai_generation_logs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project_id} <-> ai-update-log:{self.status}"
