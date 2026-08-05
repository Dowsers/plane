/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssueSLA, TSLAPolicy, TSLAPolicyPayload, TSLAReportParams, TSLAReportResponse } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for the workspace-level SLA policy engine - see
 * docs/feature-specs/06-automation-workflow-sla.md ("Politiques de SLA",
 * section 2) in plane-selfhost, and
 * apps/api/plane/app/views/sla/{base,issue,report}.py. Unlike
 * `WorkflowRuleService` (project-scoped), every policy-CRUD method here
 * takes only `workspaceSlug` - `SLAPolicy` has no `project_id`. Every
 * method except `getIssueSLA` is ADMIN-only on the backend (workspace
 * role) for every verb including read - callers must gate access
 * accordingly rather than relying on the API to hide anything.
 */
export class SLAPolicyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TSLAPolicy[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/sla-policies/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, policyId: string): Promise<TSLAPolicy> {
    return this.get(`/api/workspaces/${workspaceSlug}/sla-policies/${policyId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: TSLAPolicyPayload): Promise<TSLAPolicy> {
    return this.post(`/api/workspaces/${workspaceSlug}/sla-policies/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, policyId: string, data: TSLAPolicyPayload): Promise<TSLAPolicy> {
    return this.patch(`/api/workspaces/${workspaceSlug}/sla-policies/${policyId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, policyId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/sla-policies/${policyId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Deep-copies the policy into a new, inactive (`is_active: false`)
   * policy named `"<name> (copy)"` - see `SLAPolicyDuplicateEndpoint`. */
  async duplicate(workspaceSlug: string, policyId: string): Promise<TSLAPolicy> {
    return this.post(`/api/workspaces/${workspaceSlug}/sla-policies/${policyId}/duplicate/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Any active project member can call this - not Admin-gated, unlike
   * every other method here (see `IssueSLAEndpoint`). Returns zero, one,
   * or two entries (one per active `sla_type` the matched policy
   * configured). */
  async getIssueSLA(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueSLA[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/sla/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReport(workspaceSlug: string, params?: TSLAReportParams): Promise<TSLAReportResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/sla-report/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Fetches the same report as a CSV file (`format=csv`, see
   * `SLAReportEndpoint._csv_response`) and returns the raw blob - the
   * caller is responsible for actually triggering the browser download
   * (see `downloadSLAReportCSV` in
   * apps/web/core/components/sla-policies/compliance-report-root.tsx).
   *
   * This codebase's only other CSV export (Category 5's analytics
   * `exportCSV`, apps/web/core/components/analytics/export.ts) has no
   * server round-trip to mirror - it generates the CSV client-side from
   * rows already loaded via `export-to-csv`, whose own `download()`
   * helper does exactly a "Blob + `URL.createObjectURL` + hidden
   * `<a download>`" dance. Since this report's CSV bytes come from the
   * server (`Content-Disposition: attachment`) rather than from in-memory
   * rows, this fetches the response as a `Blob` via axios'
   * `responseType: "blob"` instead, then the same low-level download
   * mechanism is applied to it client-side.
   */
  async getReportCSVBlob(workspaceSlug: string, params?: TSLAReportParams): Promise<Blob> {
    return this.get(`/api/workspaces/${workspaceSlug}/sla-report/`, {
      params: { ...params, format: "csv" },
      responseType: "blob",
    })
      .then((response) => response?.data)
      .catch(() => {
        throw { error: "Unable to export the SLA compliance report." };
      });
  }
}
