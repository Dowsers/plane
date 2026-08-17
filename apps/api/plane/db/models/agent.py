# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
First-class agent actor type - category 9, feature 7
(docs/feature-specs/09-ai-features.md "7. Type d'acteur agent de premiere
classe" in plane-selfhost).

`AgentProfile` is the workspace-facing profile that sits on top of a bot
`User` row (`is_bot=True`, `bot_type=BotTypeEnum.WORKSPACE_AGENT` - see
`plane.db.models.user`). Deliberately NOT built on `BaseModel`/`AuditModel`:
this model doesn't want the inherited `created_by`/`updated_by`/
`deleted_at` shape - `created_by` here has a specific, spec-mandated
meaning ("humain proprietaire/responsable de l'agent", exigence 1,
required at creation) rather than "whoever's `crum` request-user happened
to be active", and disable/soft-delete is modeled as the explicit
`status=DISABLED` value (exigence 9/10) rather than a timestamp - setting
`deleted_at` would make the row invisible to the default manager and
break the very "preserve IssueComment/IssueActivity history, show the
actor as a labeled 'disabled agent'" requirement this feature exists for.
"""

import uuid

from django.db import models


class AgentProfile(models.Model):
    class AgentType(models.TextChoices):
        CLAUDE_CODE = "claude_code", "Claude Code"
        CURSOR = "cursor", "Cursor"
        GENERIC = "generic", "Generic"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        DISABLED = "DISABLED", "Disabled"

    id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True, primary_key=True)

    # The underlying bot actor - see plane.db.models.user.BotTypeEnum.WORKSPACE_AGENT.
    user = models.OneToOneField("db.User", on_delete=models.CASCADE, related_name="agent_profile")
    # An agent never exists without belonging to exactly one workspace
    # (exigence 2) - the MVP does not support one agent identity shared
    # across multiple workspaces (see spec's own "Questions ouvertes").
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="agents")
    agent_type = models.CharField(max_length=30, choices=AgentType.choices, default=AgentType.GENERIC)
    # Humain "proprietaire/responsable" of the agent (exigence 1) - required
    # for accountability at creation time, but SET_NULL (not PROTECT) so
    # deleting that human later doesn't cascade into breaking the agent.
    created_by = models.ForeignKey(
        "db.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agents_created",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    description = models.TextField(blank=True, default="")
    avatar_asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agent_profile_avatar",
    )
    # Updated on each agent-token-authenticated request (see
    # plane.api.middleware.api_authentication.APIKeyAuthentication) for a
    # cheap active/inactive indicator in the UI - never written any other way.
    last_seen_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Last Modified At")

    class Meta:
        verbose_name = "Agent Profile"
        verbose_name_plural = "Agent Profiles"
        db_table = "agent_profiles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user_id} ({self.agent_type})"
