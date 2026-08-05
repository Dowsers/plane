/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TPaginatedResponse,
  TRecurringGeneratedIssue,
  TRecurringIssueTemplate,
  TRecurringIssueTemplateListParams,
  TRecurringIssueTemplatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for recurring issue templates - see
 * docs/feature-specs/06-automation-workflow-sla.md ("Work items
 * récurrents", section 3) in plane-selfhost, and
 * apps/api/plane/app/views/recurring_issue_template/base.py. Read access is
 * Admin/Member/Guest (project level); every write verb (create/update/
 * delete/pause/resume/generate-now/convert-to-recurring) is Admin/Member
 * only - callers of this service must gate access accordingly rather than
 * relying on the API to hide anything.
 */
export class RecurringIssueTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(
    workspaceSlug: string,
    projectId: string,
    params?: TRecurringIssueTemplateListParams
  ): Promise<TPaginatedResponse<TRecurringIssueTemplate[]>> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, templateId: string): Promise<TRecurringIssueTemplate> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: TRecurringIssueTemplatePayload
  ): Promise<TRecurringIssueTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: TRecurringIssueTemplatePayload
  ): Promise<TRecurringIssueTemplate> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/${templateId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, templateId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/${templateId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Sets `is_active` to `false` - returns the full, updated template. */
  async pause(workspaceSlug: string, projectId: string, templateId: string): Promise<TRecurringIssueTemplate> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/${templateId}/pause/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Sets `is_active` to `true` and recalculates `next_run_at` from "now" -
   * no catch-up of occurrences missed while paused. Returns the full,
   * updated template. */
  async resume(workspaceSlug: string, projectId: string, templateId: string): Promise<TRecurringIssueTemplate> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/${templateId}/resume/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Manually materializes one occurrence right now - does NOT affect the
   * template's own schedule state (`next_run_at`/`occurrences_generated`/
   * `is_active` are all left untouched). Returns the newly-created issue. */
  async generateNow(workspaceSlug: string, projectId: string, templateId: string): Promise<TRecurringGeneratedIssue> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/${templateId}/generate-now/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async generatedIssues(
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    params?: TRecurringIssueTemplateListParams
  ): Promise<TPaginatedResponse<TRecurringGeneratedIssue[]>> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issue-templates/${templateId}/generated-issues/`,
      { params }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Issue-scoped (not template-scoped) endpoint - pre-fills a new,
   * inactive draft template from `issueId`'s current title/description/
   * priority/state/estimate/labels/assignees. `frequency`/`start_date` are
   * left unset; the caller must configure and then explicitly activate the
   * returned draft via a normal `update()` PATCH. */
  async convertToRecurring(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TRecurringIssueTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/convert-to-recurring/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
