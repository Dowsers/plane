/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssueCommentSummary } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9, feature 4 - "AI thread summary"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Backend:
 * `IssueCommentSummaryEndpoint`
 * (apps/api/plane/app/views/issue_comment_summary.py).
 *
 * `getSummary` treats a 404 as "no summary generated yet" rather than an
 * error - a custom `validateStatus` accepts both 200 and 404 so the
 * component can just check for `null` instead of wrapping every fetch in a
 * try/catch. Any other status (403, 429, 500, ...) still rejects normally.
 */
export class IssueCommentSummaryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSummary(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueCommentSummary | null> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/ai-summary/`,
      {},
      { validateStatus: (status: number) => status === 200 || status === 404 }
    ).then((response) => (response.status === 404 ? null : response.data));
  }

  async generateSummary(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueCommentSummary> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/ai-summary/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }

  async deleteSummary(workspaceSlug: string, projectId: string, issueId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/ai-summary/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }
}
