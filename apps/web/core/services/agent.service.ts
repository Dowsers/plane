/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  IAgentProfile,
  TAgentAPIToken,
  TAgentCreatePayload,
  TAgentTokenCreatePayload,
  TAgentUpdatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for the first-class workspace-agent actor type - category 9,
 * feature 7 (docs/feature-specs/09-ai-features.md "7. Type d'acteur agent
 * de premiere classe" in plane-selfhost), and
 * apps/api/plane/app/views/agent.py. Every method is Admin-only on the
 * backend (workspace role, for every verb) - callers must gate access
 * accordingly rather than relying on the API to hide anything (mirrors
 * `SLAPolicyService`'s own module docstring for the same reason).
 */
export class AgentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<IAgentProfile[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, agentId: string): Promise<IAgentProfile> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: TAgentCreatePayload): Promise<IAgentProfile> {
    return this.post(`/api/workspaces/${workspaceSlug}/agents/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, agentId: string, data: TAgentUpdatePayload): Promise<IAgentProfile> {
    return this.patch(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Soft-disable only (exigence 9/10) - the backend never hard-deletes an
   * `AgentProfile`/its underlying bot `User`, only flips it to
   * `status: "DISABLED"` and revokes every active token. Functionally
   * identical to `update(slug, id, { status: "DISABLED" })`, exposed as
   * its own method since it maps 1:1 onto `DELETE .../agents/{id}/`. */
  async disable(workspaceSlug: string, agentId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listTokens(workspaceSlug: string, agentId: string): Promise<TAgentAPIToken[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/${agentId}/tokens/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Returns the raw token in the `token` field - shown once, here, at
   * issuance time, same UX as the pre-existing personal API token
   * creation flow (`APITokenService.create`,
   * packages/services/src/developer/api-token.service.ts). */
  async createToken(
    workspaceSlug: string,
    agentId: string,
    data: TAgentTokenCreatePayload = {}
  ): Promise<TAgentAPIToken> {
    return this.post(`/api/workspaces/${workspaceSlug}/agents/${agentId}/tokens/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async revokeToken(workspaceSlug: string, agentId: string, tokenId: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/agents/${agentId}/tokens/${tokenId}/revoke/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
