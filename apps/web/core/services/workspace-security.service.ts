/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * client for `WorkspaceSecurityPolicy`/`WorkspaceVerifiedDomain`
 * (`plane.app.views.workspace.security`) and the sensitive-action reauth
 * challenge. Sibling to `WorkspaceAuditLogService` (features 3+5) rather
 * than folded into it - a different Owner-vs-Admin read/write split per
 * endpoint (GET is Admin+, PATCH/POST/DELETE are Owner-only) than the
 * audit log's own uniformly Owner-only surface.
 */
import { API_BASE_URL } from "@plane/constants";
import type {
  TReauthChallengeRequest,
  TReauthChallengeResponse,
  TWorkspaceSecurityPolicy,
  TWorkspaceSecurityPolicyUpdatePayload,
  TWorkspaceVerifiedDomain,
  TWorkspaceVerifiedDomainCreatePayload,
  TWorkspaceVerifiedDomainVerifyResponse,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class WorkspaceSecurityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** GET /api/workspaces/<slug>/security-policy/ - Admin+ read. */
  async getSecurityPolicy(workspaceSlug: string): Promise<TWorkspaceSecurityPolicy> {
    return this.get(`/api/workspaces/${workspaceSlug}/security-policy/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** PATCH /api/workspaces/<slug>/security-policy/ - Owner only, may be
   * itself gated by `force_reauth_for_sensitive_actions` (exigence 8) -
   * see `@/hooks/use-sensitive-action-guard`. */
  async updateSecurityPolicy(
    workspaceSlug: string,
    data: TWorkspaceSecurityPolicyUpdatePayload
  ): Promise<TWorkspaceSecurityPolicy> {
    return this.patch(`/api/workspaces/${workspaceSlug}/security-policy/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/verified-domains/ - Admin+ read. */
  async listVerifiedDomains(workspaceSlug: string): Promise<TWorkspaceVerifiedDomain[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/verified-domains/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST /api/workspaces/<slug>/verified-domains/ - Owner only. Creates
   * the domain row + generates its verification token, does NOT verify. */
  async createVerifiedDomain(
    workspaceSlug: string,
    data: TWorkspaceVerifiedDomainCreatePayload
  ): Promise<TWorkspaceVerifiedDomain> {
    return this.post(`/api/workspaces/${workspaceSlug}/verified-domains/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST /api/workspaces/<slug>/verified-domains/<id>/verify/ - Owner
   * only. SYNCHRONOUS (bounded ~10-15s worst case, see the backend
   * endpoint's own docstring) - no polling needed, just a loading state. */
  async verifyDomain(workspaceSlug: string, domainId: string): Promise<TWorkspaceVerifiedDomainVerifyResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/verified-domains/${domainId}/verify/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** DELETE /api/workspaces/<slug>/verified-domains/<id>/ - Owner only. */
  async deleteVerifiedDomain(workspaceSlug: string, domainId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/verified-domains/${domainId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST /api/workspaces/<slug>/reauth/ - exigence 8's "confirm you are
   * still you" challenge, consumed by `@/hooks/use-sensitive-action-guard`
   * and the reauth modal it opens. Account-level in effect (refreshes
   * `User.last_authenticated_at` for every workspace's gate at once) even
   * though the URL is workspace-scoped - see the backend endpoint's own
   * docstring for why. */
  async requestReauth(workspaceSlug: string, data: TReauthChallengeRequest): Promise<TReauthChallengeResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/reauth/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const workspaceSecurityService = new WorkspaceSecurityService();

export default workspaceSecurityService;
