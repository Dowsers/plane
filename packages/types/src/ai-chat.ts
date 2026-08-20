/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import type { IUserLite } from "./users";

/**
 * Category 9 (AI features, docs/feature-specs/09-ai-features.md in
 * plane-selfhost), feature 3 - "Assistant de chat IA in-app". Mirrors the
 * backend shapes in `plane.db.models.ai_chat`/
 * `plane.app.serializers.ai_chat` (apps/api/plane/app/serializers/ai_chat.py)
 * and the settings endpoints in
 * `apps/api/plane/app/views/ai_assistant_config.py` verbatim - see the
 * commit that added the backend ("Add in-app AI chat assistant backend,
 * polling-based (category 9, feature 3)") for the exact response shapes.
 */

export type TAIConversationContextType = "workspace" | "project" | "issue" | "cycle" | "module" | "page";

export type TAIConversationSource = "command_palette" | "comment_mention";

export type TAIMessageRole = "user" | "assistant" | "system";

export type TAIMessageMode = "ask" | "propose";

/** `streaming` never means real token-by-token streaming here (this
 * backend has none, see the backend module's own docstring) - it just
 * means "still generating server-side, keep polling `GET .../messages/`". */
export type TAIMessageStatus = "pending" | "streaming" | "completed" | "failed";

export type TAIChangeProposalTargetModel = "issue" | "cycle" | "module" | "page";

export type TAIChangeProposalStatus = "pending" | "approved" | "rejected" | "applied" | "expired";

/** One chat thread - `GET/POST /workspaces/:slug/ai-conversations/`,
 * `GET /workspaces/:slug/ai-conversations/:pk/`. `context_object_id` is
 * `null` only when `context_type === "workspace"`. */
export type TAIConversation = {
  id: string;
  workspace: string;
  created_by: string;
  created_by_detail: IUserLite;
  context_type: TAIConversationContextType;
  context_object_id: string | null;
  title: string;
  source: TAIConversationSource;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

/** Request body for `POST /workspaces/:slug/ai-conversations/`. */
export type TAIConversationCreatePayload = {
  context_type: TAIConversationContextType;
  context_object_id?: string | null;
  title?: string;
};

/** One message in a conversation -
 * `GET /workspaces/:slug/ai-conversations/:pk/messages/`. Every field is
 * read-only on the backend serializer. */
export type TAIMessage = {
  id: string;
  conversation: string;
  role: TAIMessageRole;
  content: string;
  mode: TAIMessageMode;
  token_count_input: number | null;
  token_count_output: number | null;
  status: TAIMessageStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

/** Request body for `POST /workspaces/:slug/ai-conversations/:pk/messages/`. */
export type TAIMessageCreatePayload = {
  content: string;
  mode?: TAIMessageMode;
};

/** Response of `POST /workspaces/:slug/ai-conversations/:pk/messages/` -
 * the assistant reply is generated synchronously within this same
 * request (no SSE/streaming bytes - see the backend's own module
 * docstring), so `assistant_message.status` is usually already
 * `completed`/`failed` by the time this resolves. It can still come back
 * `pending`, so callers must poll `GET .../messages/` afterwards
 * regardless, exactly as if `status` had been `streaming`. */
export type TAIMessageSendResponse = {
  user_message: TAIMessage;
  assistant_message: TAIMessage;
};

/** One atomic, individually-approvable suggested change produced by a
 * "propose" mode assistant message -
 * `GET /workspaces/:slug/ai-proposals/`. `project` is the TARGET object's
 * real project, `null` when not applicable (e.g. a workspace-global page
 * with no linked project). `proposed_value`/`previous_value` are
 * arbitrary JSON (shape depends on `field_name`) - rendered as a plain
 * before/after diff, not interpreted further on the frontend. */
export type TAIChangeProposal = {
  id: string;
  message: string;
  workspace: string;
  project: string | null;
  target_model: TAIChangeProposalTargetModel;
  target_object_id: string;
  field_name: string;
  proposed_value: unknown;
  previous_value: unknown;
  status: TAIChangeProposalStatus;
  reviewed_by: string | null;
  reviewed_by_detail: IUserLite | null;
  reviewed_at: string | null;
  applied_at: string | null;
  applied_activity_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

/** Optional filters for `GET /workspaces/:slug/ai-proposals/`. */
export type TAIChangeProposalListParams = {
  status?: TAIChangeProposalStatus;
  cursor?: string;
};

/** Response shape of
 * `GET/PATCH /workspaces/:slug/ai-assistant-config/` - Admin only for
 * both verbs (unlike `is_ai_triage_enabled`/`is_ai_summary_enabled`,
 * which sit on the generically-readable workspace object, this feature's
 * master switch is never exposed to non-admins directly - see
 * `AIAssistantConfigService`'s own docstring). */
export type TWorkspaceAIAssistantConfig = {
  is_ai_assistant_enabled: boolean;
  ai_assistant_max_messages_per_user_per_hour: number;
};

export type TWorkspaceAIAssistantConfigPayload = Partial<TWorkspaceAIAssistantConfig>;

/** Response shape of
 * `GET/PATCH /workspaces/:slug/projects/:projectId/ai-assistant-config/` -
 * Admin only for both verbs. `is_ai_assistant_enabled: null` is the
 * tri-state "inherit the workspace master switch" value - same convention
 * as `TProjectAITriageConfig.is_ai_triage_enabled`/
 * `TProjectDuplicateDetectionConfig.is_duplicate_detection_enabled`, never
 * collapse this to a plain boolean. `workspace_master_switch_enabled` is a
 * read-only convenience echo of `Workspace.is_ai_assistant_enabled`. */
export type TProjectAIAssistantConfig = {
  is_ai_assistant_enabled: boolean | null;
  workspace_master_switch_enabled: boolean;
};

export type TProjectAIAssistantConfigPayload = {
  is_ai_assistant_enabled: boolean | null;
};
