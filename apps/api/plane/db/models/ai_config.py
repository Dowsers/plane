# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared per-workspace LLM connection/config model - a category 9 (AI
features, docs/feature-specs/09-ai-features.md in plane-selfhost)
INFRASTRUCTURE PREREQUISITE, analogous to category 7's small
`category7-foundation` prerequisite (encrypted field + bot helper) that its
6 features later built on top of.

WHY ONE SHARED MODEL: every one of category 9's 5 upcoming features
(thread summary, status-update drafting, auto-triage, duplicate
detection's optional external-embedding path, digest, chat assistant) was
specced with its OWN separately-invented config model
(`WorkspaceAIConfig`/`WorkspaceAIIntegration`/`WorkspaceAIConfiguration`/
`WorkspaceLLMConfig` - none of those specs is authoritative on the actual
shape). 3 independent research agents unanimously recommended building one
shared model instead - this is it.

RELATIONSHIP TO THE EXISTING INSTANCE-WIDE CONNECTOR: this fork already has
a real, working, instance-wide ("God Mode" `InstanceConfiguration`-backed)
LLM connector - `plane.app.views.external.base` (`get_llm_config`,
`GPTIntegrationEndpoint`/`WorkspaceGPTIntegrationEndpoint`, backing the
rich-text editor's "Ask AI" popover). That code path is NOT modified by
this model and keeps working exactly as before. This model is a NEW,
separate, per-workspace mechanism that future category 9 features call
through `plane.utils.workspace_ai.get_workspace_llm_response` instead -
deliberately no fallback to the instance-wide key (see that module's
docstring for the explicit "no fallback" design decision).

SHAPE: modeled on category 7's connector convention
(`GithubWorkspaceConnection`/`WorkspaceSentryConnection` etc. in this same
package) rather than any single category 9 spec's own invented shape - a
`WorkspaceBaseModel` subclass, one row per workspace via a partial unique
constraint on `workspace` scoped to `deleted_at__isnull=True` (so a
workspace can reconfigure after a soft-delete/disconnect without a hard
delete first), `EncryptedTextField` for the secret, an `is_enabled`
boolean, `connected_by` FK to `User`.

Deliberately minimal - connection config only, no feature-specific fields
(no rate-limit counters, no per-feature toggles). Those belong to each
individual future feature's own model, not this shared foundation.
"""

from django.db import models

from plane.db.fields import EncryptedTextField

from .workspace import WorkspaceBaseModel


class WorkspaceAIProvider(models.TextChoices):
    OPENAI = "openai", "OpenAI"
    ANTHROPIC = "anthropic", "Anthropic"
    GEMINI = "gemini", "Gemini"
    # Self-hosted OpenAI-compatible endpoint (Ollama, vLLM, etc.) - several
    # category 9 specs explicitly want this for air-gapped deployments.
    CUSTOM_OPENAI_COMPATIBLE = "custom_openai_compatible", "Custom (OpenAI-compatible)"


class WorkspaceAIConfig(WorkspaceBaseModel):
    """One row per workspace - see module docstring re: the partial unique
    constraint instead of a hard DB-level `unique=True` on the FK."""

    is_enabled = models.BooleanField(default=False)
    provider = models.CharField(
        max_length=30, choices=WorkspaceAIProvider.choices, default=WorkspaceAIProvider.OPENAI
    )
    # Nullable: required in practice for OPENAI/ANTHROPIC/GEMINI, but a
    # CUSTOM_OPENAI_COMPATIBLE endpoint pointed at a local, unauthenticated
    # server may have none - the write endpoint decides what to require per
    # provider, not the model layer.
    api_key = EncryptedTextField(null=True, blank=True)
    # Only meaningfully used for CUSTOM_OPENAI_COMPATIBLE, but left nullable
    # for every provider in case someone wants to point at a proxy.
    api_base_url = models.CharField(max_length=1000, null=True, blank=True)
    model_name = models.CharField(max_length=255)
    connected_by = models.ForeignKey(
        "db.User", on_delete=models.SET_NULL, null=True, related_name="workspace_ai_configs_connected"
    )

    class Meta:
        verbose_name = "Workspace AI Config"
        verbose_name_plural = "Workspace AI Configs"
        db_table = "workspace_ai_configs"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_ai_config_unique_workspace_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.workspace_id} <-> ai:{self.provider}"
