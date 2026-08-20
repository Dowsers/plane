/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TAIChangeProposal,
  TAIChangeProposalListParams,
  TAIConversation,
  TAIConversationCreatePayload,
  TAIMessage,
  TAIMessageCreatePayload,
  TAIMessageSendResponse,
  TPaginatedResponse,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9 (AI features, docs/feature-specs/09-ai-features.md
 * in plane-selfhost), feature 3 - "Assistant de chat IA in-app". Backend:
 * `AIConversationListCreateEndpoint`/`AIConversationDetailEndpoint`/
 * `AIConversationMessageListCreateEndpoint`/`AIChangeProposalListEndpoint`/
 * `AIChangeProposalApproveEndpoint`/`AIChangeProposalRejectEndpoint`
 * (apps/api/plane/app/views/ai_chat.py) - every verb here is available to
 * any active Admin/Member/Guest (workspace-level `allow_permission`), the
 * per-object gating (Guest blocked from "propose" mode, Member+ required
 * to approve/reject against the SPECIFIC target object) happens inside the
 * request bodies/responses themselves, not via a different permission
 * class - see each method's own docstring for the exact error shape a
 * caller should expect back.
 *
 * See `AIAssistantConfigService` for the separate Admin-only workspace/
 * project enable/disable settings.
 */
export class AIChatService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Own conversations only (backend filters to `created_by=request.user`) -
   * paginated, most recent first. */
  async listConversations(workspaceSlug: string, cursor?: string): Promise<TPaginatedResponse<TAIConversation[]>> {
    return this.get(`/api/workspaces/${workspaceSlug}/ai-conversations/`, {
      params: cursor ? { cursor } : undefined,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Rejects with `400` if the assistant isn't available for the requested
   * context (feature disabled at workspace/project level, or no configured
   * `WorkspaceAIConfig`), `403` if the context object itself isn't
   * accessible to the requesting user. */
  async createConversation(workspaceSlug: string, data: TAIConversationCreatePayload): Promise<TAIConversation> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-conversations/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }

  async getConversation(workspaceSlug: string, conversationId: string): Promise<TAIConversation> {
    return this.get(`/api/workspaces/${workspaceSlug}/ai-conversations/${conversationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** The POLLING endpoint - callers should keep calling this every 1-2s
   * while the latest assistant message's `status` is `pending`/
   * `streaming`, then stop. Always returns the full message list in
   * chronological order (no pagination). */
  async listMessages(workspaceSlug: string, conversationId: string): Promise<TAIMessage[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/ai-conversations/${conversationId}/messages/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** The assistant reply is generated synchronously within this request
   * (see `TAIMessageSendResponse`'s own docstring) - the response already
   * contains both the user message and the (usually settled) assistant
   * message. Rejects with `{ status: 403, ... }` if `mode: "propose"` was
   * requested by a Guest (or anyone below Member on the conversation's own
   * context object), `{ status: 400, ... }` if the assistant became
   * unavailable for this context since the conversation was created, and
   * `{ status: 429, ... }` once the workspace's configurable
   * per-user-per-hour rate limit is hit. */
  async sendMessage(
    workspaceSlug: string,
    conversationId: string,
    data: TAIMessageCreatePayload
  ): Promise<TAIMessageSendResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-conversations/${conversationId}/messages/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }

  /** Visible to the proposal's own conversation owner OR any active member
   * of the target object's project (so an approver sees incoming
   * proposals, not just their own chat history) - a documented frontend/
   * backend visibility choice, not something the spec itself prescribes
   * the exact filter for. */
  async listProposals(
    workspaceSlug: string,
    params: TAIChangeProposalListParams = {}
  ): Promise<TPaginatedResponse<TAIChangeProposal[]>> {
    return this.get(`/api/workspaces/${workspaceSlug}/ai-proposals/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Rejects with `{ status: 400, ... }` if the proposal already expired
   * or was already resolved, `{ status: 403, ... }` if the requesting user
   * doesn't have Member+ access to the proposal's SPECIFIC target object
   * (Guest is always blocked here, regardless of workspace role). */
  async approveProposal(workspaceSlug: string, proposalId: string): Promise<TAIChangeProposal> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-proposals/${proposalId}/approve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }

  /** Same guard/error shape as `approveProposal`. */
  async rejectProposal(workspaceSlug: string, proposalId: string): Promise<TAIChangeProposal> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-proposals/${proposalId}/reject/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }
}
