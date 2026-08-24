/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 2 ("SCIM 2.0 natif") - client for the
 * ADMIN-facing "manage my SCIM setup" surface
 * (`plane.app.views.workspace.scim_admin`, apps/api) - SCIM token CRUD and
 * the SCIM provisioning-log read. Sibling to `WorkspaceSecurityService`
 * (feature 6) and `WorkspaceAuditLogService` (features 3+5) rather than
 * folded into either - this feature's own gating (Admin-or-Owner, exigence
 * 3/10) differs from both (feature 6 is Admin-read/Owner-write per
 * endpoint, features 3+5's audit log is Owner-only end to end).
 *
 * NOT a client for `/api/scim/v2/*` itself (the IdP-facing protocol
 * surface) - nothing in this frontend checkpoint calls that.
 */
import { API_BASE_URL } from "@plane/constants";
import type {
  TPaginatedResponse,
  TSCIMToken,
  TSCIMTokenCreatePayload,
  TSCIMTokenCreateResponse,
  TWorkspaceAuditLogDetail,
  TWorkspaceAuditLogListItem,
  TWorkspaceAuditLogListParams,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class WorkspaceSCIMService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** GET /api/workspaces/<slug>/scim/tokens/ - list, masked (exigence 3).
   * 403 if `ENABLE_SCIM` is off instance-wide, or the caller is below
   * workspace Admin. */
  async listTokens(workspaceSlug: string): Promise<TSCIMToken[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/scim/tokens/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST /api/workspaces/<slug>/scim/tokens/ - the raw Bearer token is
   * present in the response exactly once, never re-fetchable afterwards. */
  async createToken(workspaceSlug: string, data: TSCIMTokenCreatePayload): Promise<TSCIMTokenCreateResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/scim/tokens/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** DELETE /api/workspaces/<slug>/scim/tokens/<id>/ - soft-delete
   * (revoke), matching `ApiTokenEndpoint.delete`'s own `APIToken`
   * precedent - immediate and irreversible from the UI's perspective. */
  async revokeToken(workspaceSlug: string, tokenId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/scim/tokens/${tokenId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * GET /api/workspaces/<slug>/scim/provisioning-log/ - a filtered view
   * over the same `WorkspaceAuditLog` `features 3+5` already type/list, so
   * the response shape is reused as-is (`TWorkspaceAuditLogListItem`)
   * rather than duplicated. Always scoped server-side to the 4 SCIM event
   * types (`SCIM_EVENT_TYPES`, apps/api/plane/app/views/workspace/
   * scim_admin.py) regardless of any `event_type` filter passed here.
   * Admin+ (not Owner-exclusive, unlike `WorkspaceAuditLogService.list`)
   * and NOT gated by `ENABLE_SCIM` - past provisioning history stays
   * visible even if SCIM is later disabled instance-wide.
   */
  async listProvisioningLog(
    workspaceSlug: string,
    params: TWorkspaceAuditLogListParams
  ): Promise<TPaginatedResponse<TWorkspaceAuditLogListItem[]>> {
    const { event_type, ...rest } = params;
    return this.get(`/api/workspaces/${workspaceSlug}/scim/provisioning-log/`, {
      params: { ...rest, event_type: event_type?.length ? event_type.join(",") : undefined },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * GET /api/workspaces/<slug>/scim/provisioning-log/<id>/ - full detail
   * payload for a single SCIM provisioning-log entry. Small, documented
   * backend addition alongside this frontend checkpoint
   * (`WorkspaceSCIMProvisioningLogEndpoint.get`, apps/api/plane/app/views/
   * workspace/scim_admin.py): the general `GET /api/workspaces/<slug>/
   * audit-logs/<id>/` detail endpoint is Owner-only
   * (`WorkspaceAuditLogViewSet`), which would 403 for a plain workspace
   * Admin even though this feature's own list endpoint is Admin-readable -
   * a real access-policy mismatch that would have made "detail on click"
   * silently fail for exactly the audience (Admin, not just Owner) this
   * feature targets. Deliberately NOT `WorkspaceAuditLogService.retrieve` -
   * same gating as `listProvisioningLog` above, not the Owner-only one.
   */
  async getProvisioningLogDetail(workspaceSlug: string, auditLogId: string): Promise<TWorkspaceAuditLogDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/scim/provisioning-log/${auditLogId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const workspaceSCIMService = new WorkspaceSCIMService();

export default workspaceSCIMService;
