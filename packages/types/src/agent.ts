/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Types for the first-class workspace-agent actor type - category 9,
// feature 7 (docs/feature-specs/09-ai-features.md "7. Type d'acteur agent
// de premiere classe" in plane-selfhost), and the backend half of this
// feature: apps/api/plane/app/views/agent.py,
// apps/api/plane/app/serializers/agent.py, apps/api/plane/db/models/agent.py.
// `AgentProfile` sits on top of a bot `User` row (`is_bot=True`,
// `bot_type="WORKSPACE_AGENT"` - see `WORKSPACE_AGENT_BOT_TYPE` in
// @plane/utils and `IUserLite.bot_type` in ./users), which is why
// `IAgentProfile` itself carries no `is_bot`/`bot_type` field of its own.

import type { IUserLite } from "./users";

export type TAgentType = "claude_code" | "cursor" | "generic";

export type TAgentStatus = "ACTIVE" | "DISABLED";

/** Mirrors `AgentProfileSerializer` exactly (apps/api/plane/app/serializers/
 * agent.py) - every field here is read-only on the wire except through the
 * dedicated `TAgentCreatePayload`/`TAgentUpdatePayload` request shapes
 * below; `AgentProfileSerializer.Meta.read_only_fields` marks everything
 * except `agent_type`/`description`/`status` as server-derived. */
export type IAgentProfile = {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string;
  workspace: string;
  agent_type: TAgentType;
  status: TAgentStatus;
  description: string;
  created_by: IUserLite | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  /** Annotated on the backend queryset - active `ProjectMember` count. */
  project_count: number;
};

/** Body of `POST /api/workspaces/{slug}/agents/`
 * (`AgentProfileViewSet.create`) - note there is deliberately no `role`
 * field: an agent is always created as workspace Member, never Admin, and
 * the backend never reads a `role` key off the request body at all. */
export type TAgentCreatePayload = {
  display_name: string;
  agent_type: TAgentType;
  description?: string;
};

/** Body of `PATCH /api/workspaces/{slug}/agents/{id}/`
 * (`AgentProfileViewSet.partial_update`) - every key is optional and
 * independently applied; setting `status: "DISABLED"` immediately revokes
 * every active token for this agent server-side. */
export type TAgentUpdatePayload = Partial<{
  display_name: string;
  description: string;
  agent_type: TAgentType;
  status: TAgentStatus;
}>;

/** Shape returned by both agent-token endpoints
 * (`AgentTokenListCreateEndpoint`, apps/api/plane/app/views/agent.py) -
 * `token` (the raw secret) is present ONLY on the `POST` (issuance)
 * response (`AgentAPITokenSerializer`); `GET` (list) uses
 * `AgentAPITokenReadSerializer`, which excludes it - same "shown once,
 * never again" convention as the pre-existing personal `IApiToken`
 * (./api_token.ts). */
export type TAgentAPIToken = {
  id: string;
  label: string;
  description: string;
  is_active: boolean;
  last_used: string | null;
  created_at: string;
  updated_at: string;
  expired_at: string | null;
  agent: string;
  workspace: string;
  user: string;
  user_type: number;
  token?: string;
};

/** Body of `POST /api/workspaces/{slug}/agents/{id}/tokens/`
 * (`AgentTokenListCreateEndpoint.post`) - both fields optional, the
 * backend defaults `label` to `"<agent display name> token"` when omitted. */
export type TAgentTokenCreatePayload = Partial<{
  label: string;
  description: string;
}>;
