/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3 ("Journal d'audit de securite workspace") +
 * 5 ("Role Owner dedie + Team/Project Owner delegue") merged - client for
 * the workspace-scoped `WorkspaceAuditLog` read/export surface
 * (`plane.app.views.workspace.audit_log`, Owner-only, 403 for any
 * non-Owner including a plain Admin).
 */
import { API_BASE_URL } from "@plane/constants";
import type {
  TPaginatedResponse,
  TWorkspaceAuditLogDetail,
  TWorkspaceAuditLogFilters,
  TWorkspaceAuditLogListItem,
  TWorkspaceAuditLogListParams,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class WorkspaceAuditLogService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** GET /api/workspaces/<slug>/audit-logs/ - paginated (cursor) list. */
  async list(
    workspaceSlug: string,
    params: TWorkspaceAuditLogListParams
  ): Promise<TPaginatedResponse<TWorkspaceAuditLogListItem[]>> {
    // `event_type` is sent comma-joined (rather than relying on axios's own
    // array param serialization, which this fork doesn't otherwise rely
    // on) - `apply_audit_log_filters` (apps/api/plane/utils/
    // audit_log_filters.py) explicitly accepts this shape.
    const { event_type, ...rest } = params;
    return this.get(`/api/workspaces/${workspaceSlug}/audit-logs/`, {
      params: { ...rest, event_type: event_type?.length ? event_type.join(",") : undefined },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/audit-logs/<pk>/ - full detail payload. */
  async retrieve(workspaceSlug: string, auditLogId: string): Promise<TWorkspaceAuditLogDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/audit-logs/${auditLogId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * POST /api/workspaces/<slug>/audit-logs/export/ - triggers an async CSV
   * export job against the same `apply_audit_log_filters` shared by
   * `list()` above, so the export can never silently diverge from what is
   * on screen. Follows the same "job queued" UX as the pre-existing issue
   * export (`ExportIssuesEndpoint`) - the result is recorded as an
   * `ExporterHistory` row (`type="audit_log_exports"`), but note that
   * unlike issue exports there is currently no frontend-visible listing
   * for this export type (`GET .../export-issues/` hardcodes
   * `type="issue_exports"` server-side) - see this feature's own README/
   * report for that scoping note.
   */
  async exportCsv(workspaceSlug: string, filters: TWorkspaceAuditLogFilters): Promise<{ message: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/audit-logs/export/`, filters)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const workspaceAuditLogService = new WorkspaceAuditLogService();

export default workspaceAuditLogService;
