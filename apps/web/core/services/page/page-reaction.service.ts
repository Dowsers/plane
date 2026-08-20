/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { TPageReaction } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Category 10, feature 2 ("Reactions emoji sur les Pages") - mirrors
 * `IssueReactionService` (@/services/issue/issue_reaction.service), scoped
 * to the project-level page reaction endpoints only (no workspace-level
 * Page CRUD endpoint exists yet in this fork - see
 * `plane.db.models.page_reaction.PageReaction`'s backend docstring).
 */
export class PageReactionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listReactions(workspaceSlug: string, projectId: string, pageId: string): Promise<TPageReaction[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/reactions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createReaction(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    data: Partial<TPageReaction>
  ): Promise<TPageReaction> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/reactions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeReaction(workspaceSlug: string, projectId: string, pageId: string, reaction: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/reactions/${reaction}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
