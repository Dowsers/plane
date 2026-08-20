# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 3 - "Assistant de chat IA in-app". The LAST and
biggest feature in this category - every other category 9 feature is
already shipped and this one deliberately reuses their infrastructure
rather than inventing parallel mechanisms:

- `plane.db.models.ai_config.WorkspaceAIConfig` / `plane.utils.workspace_ai`
  for the actual LLM call (no new per-feature connector model here, unlike
  the spec's own data-model section, which wanted a duplicate).
- `plane.utils.integration_bot.get_or_create_integration_bot` +
  `BotTypeEnum.AI_ASSISTANT_BOT` (see `plane.db.models.user`) for the
  assistant's own actor identity when it posts a reply as an
  `IssueComment` in a `@mention` thread.
- `plane.utils.agent_actor` (generalized, see that module) so the bot is
  member-visible/mentionable the same way `WORKSPACE_AGENT` already is.

NO SSE / NO REAL TOKEN STREAMING (deliberate, confirmed decision - this
fork has no confirmed-working async DRF view and no confirmed reverse-proxy
buffering config, and every other category 9 "in progress" feature already
ships via the same shape below instead): `AIMessage.status` still has a
`streaming` value, but it means "still being generated server-side, keep
polling `GET .../messages/`" - never "bytes are being pushed to you right
now". See `plane.utils.ai_chat_assistant` for how a message's assistant
reply is actually generated (a plain synchronous LLM round-trip within the
`POST .../messages/` request - see that module's own docstring for why
sync was chosen over a Celery task that updates `content` incrementally).

NO GOVERNED-WORKFLOWS DEPENDENCY (deliberate): an approved proposal is
applied through the SAME serializer/bgtask path a manual PATCH already
uses (`IssueCreateSerializer` + `plane.bgtasks.issue_activities_task.
issue_activity`, see `plane.utils.ai_chat_assistant.apply_change_proposal`)
- NOT through `plane.utils.workflow_transition_engine`, whose own phase 2
(wiring into real `Issue.state` mutation) was deliberately never finished
and is out of scope here.

PROVENANCE WITHOUT A BOT ACTOR (exigence 9 - "l'assistant ne doit jamais
apparaitre comme auteur reel des changements"): when a proposal is
approved and applied, the resulting `IssueActivity` (only Issue has an
activity trail in this codebase - Cycle/Module/Page do not) gets
`actor=<the human approver>` and `is_automation=False`, exactly like any
other manual edit. AI provenance is instead traceable via THIS row itself
(`AIChangeProposal.applied_activity_id` points back at the created
`IssueActivity`, and the proposal is always findable by
`target_object_id`) - no `origin` field was added to the shared
`IssueActivity` model to avoid a schema change to a heavily-used core
model for a need this satellite row already covers.
"""

from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from .base import BaseModel
from .workspace import WorkspaceBaseModel


class AIConversationContextType(models.TextChoices):
    WORKSPACE = "workspace", "Workspace"
    PROJECT = "project", "Project"
    ISSUE = "issue", "Issue"
    CYCLE = "cycle", "Cycle"
    MODULE = "module", "Module"
    PAGE = "page", "Page"


class AIConversationSource(models.TextChoices):
    COMMAND_PALETTE = "command_palette", "Command Palette"
    COMMENT_MENTION = "comment_mention", "Comment Mention"


class AIConversation(WorkspaceBaseModel):
    """One chat thread. `project` (inherited from `WorkspaceBaseModel`) is
    deliberately unused/always null here - same convention already used by
    `WorkspaceAIConfig` (a workspace-scoped row that never sets `project`
    either) - the actual context object is `context_type`/
    `context_object_id` below, which spans project/issue/cycle/module/page,
    not just Project.

    `created_by` (inherited from `BaseModel`/`UserAuditModel`, auto-set on
    save from the request's current user) IS the ownership field used for
    "list my own conversations" filtering - no separate duplicate `user`
    FK was added.
    """

    context_type = models.CharField(max_length=20, choices=AIConversationContextType.choices)
    # Null only for context_type == "workspace" (exigence 2's own wording).
    context_object_id = models.UUIDField(null=True, blank=True)
    title = models.CharField(max_length=255, blank=True, default="")
    source = models.CharField(
        max_length=20, choices=AIConversationSource.choices, default=AIConversationSource.COMMAND_PALETTE
    )
    is_archived = models.BooleanField(default=False)

    class Meta:
        verbose_name = "AI Conversation"
        verbose_name_plural = "AI Conversations"
        db_table = "ai_conversations"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workspace", "created_by", "-created_at"], name="ai_conv_workspace_creator_idx")
        ]

    def __str__(self):
        return f"{self.workspace_id} <-> ai-conversation:{self.context_type}"


class AIMessageRole(models.TextChoices):
    USER = "user", "User"
    ASSISTANT = "assistant", "Assistant"
    SYSTEM = "system", "System"


class AIMessageMode(models.TextChoices):
    ASK = "ask", "Ask"
    PROPOSE = "propose", "Propose"


class AIMessageStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    # See module docstring - "still generating, keep polling", never a real
    # SSE/streaming state.
    STREAMING = "streaming", "Streaming"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"


class AIMessage(BaseModel):
    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=AIMessageRole.choices)
    content = models.TextField(blank=True, default="")
    # Only meaningful on assistant messages - the mode the USER message
    # that triggered this reply was sent in. Kept on every row (including
    # user/system rows, where it just mirrors the conversation's current
    # mode at send time) rather than only on assistant rows, so the full
    # message list is self-describing without a join back to whatever
    # request originally created it.
    mode = models.CharField(max_length=10, choices=AIMessageMode.choices, default=AIMessageMode.ASK)
    # Best-effort estimates (this fork's shared `call_llm` does not surface
    # real provider token-usage figures - see plane.utils.workspace_ai) -
    # NOT a substitute for provider-side billing/usage data. Null on
    # user/system rows.
    token_count_input = models.PositiveIntegerField(null=True, blank=True)
    token_count_output = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=AIMessageStatus.choices, default=AIMessageStatus.COMPLETED)
    error_message = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "AI Message"
        verbose_name_plural = "AI Messages"
        db_table = "ai_messages"
        ordering = ("created_at",)
        indexes = [models.Index(fields=["conversation", "created_at"], name="ai_message_conv_created_idx")]

    def __str__(self):
        return f"{self.conversation_id} <-> ai-message:{self.role}"


class AIChangeProposalTargetModel(models.TextChoices):
    ISSUE = "issue", "Issue"
    CYCLE = "cycle", "Cycle"
    MODULE = "module", "Module"
    PAGE = "page", "Page"


class AIChangeProposalStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    APPLIED = "applied", "Applied"
    EXPIRED = "expired", "Expired"


def default_proposal_expiry():
    """Exigence 8 - default 7-day expiry window."""
    return timezone.now() + timedelta(days=7)


class AIChangeProposal(WorkspaceBaseModel):
    """One atomic, individually-approvable suggested change (one field/
    action per row - exigence 5). `project` (inherited from
    `WorkspaceBaseModel`) is the TARGET object's real project, used to
    scope "proposals on objects in projects I can access" listings - null
    when not applicable (e.g. a workspace-global page with no linked
    project).
    """

    message = models.ForeignKey(AIMessage, on_delete=models.CASCADE, related_name="proposals")
    target_model = models.CharField(max_length=10, choices=AIChangeProposalTargetModel.choices)
    target_object_id = models.UUIDField()
    field_name = models.CharField(max_length=100)
    proposed_value = models.JSONField(default=dict, blank=True)
    # Snapshot at proposal-creation time - exigence 5's "diff avant/apres".
    previous_value = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=10, choices=AIChangeProposalStatus.choices, default=AIChangeProposalStatus.PENDING
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_change_proposals_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(default=default_proposal_expiry)
    # Provenance link (see module docstring) - the `IssueActivity` this
    # proposal's approval produced, when target_model == "issue". Null
    # before applying, and always null for cycle/module/page targets
    # (no activity-trail model exists for those in this codebase).
    applied_activity_id = models.UUIDField(null=True, blank=True)

    class Meta:
        verbose_name = "AI Change Proposal"
        verbose_name_plural = "AI Change Proposals"
        db_table = "ai_change_proposals"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["status", "expires_at"], name="ai_proposal_status_expiry_idx")]

    def __str__(self):
        return f"{self.target_model}:{self.target_object_id} <-> {self.field_name} ({self.status})"
