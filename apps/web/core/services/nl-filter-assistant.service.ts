/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  TNLFilterAssistantRecentQuery,
  TNLFilterAssistantRequest,
  TNLFilterAssistantResponse,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Deterministic, rule-based natural-language filter assistant - see
 * `ProjectNLFilterAssistantEndpoint`/`WorkspaceNLFilterAssistantEndpoint`/
 * `NLFilterAssistantRecentEndpoint`
 * (apps/api/plane/app/views/view/nl_filter_assistant.py) and
 * docs/feature-specs/04-views-filters.md ("Assistant de filtre en langage
 * naturel") in plane-selfhost.
 */
export class NLFilterAssistantService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Project-scoped parsing - fuzzy-matches member/label/state/cycle/module names against this project only. */
  async parseForProject(
    workspaceSlug: string,
    projectId: string,
    data: TNLFilterAssistantRequest
  ): Promise<TNLFilterAssistantResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/ai-filter-assistant/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Workspace-scoped parsing (My Issues, workspace Views) - member names only, see the endpoint's docstring for why. */
  async parseForWorkspace(workspaceSlug: string, data: TNLFilterAssistantRequest): Promise<TNLFilterAssistantResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-filter-assistant/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Last 5 queries by the current user in this project (or workspace, if `projectId` is omitted). */
  async listRecent(workspaceSlug: string, projectId?: string): Promise<TNLFilterAssistantRecentQuery[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/ai-filter-assistant/recent/`, {
      params: projectId ? { project_id: projectId } : {},
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const nlFilterAssistantService = new NLFilterAssistantService();
