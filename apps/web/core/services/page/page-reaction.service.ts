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
 * `IssueReactionService` (@/services/issue/issue_reaction.service).
 * `listReactions`/`createReaction`/`removeReaction` cover the project-level
 * page reaction endpoints; the `*WorkspaceReaction*` methods below cover
 * the workspace-scoped ones added by category 10, feature 4 ("Wiki
 * workspace en GA") - same `PageReaction` model/serializer, reused a
 * second time at the workspace scope, mirroring how the backend's own
 * `WorkspacePageReactionViewSet` subclasses `PageReactionViewSet` instead
 * of duplicating it.
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

  async listWorkspaceReactions(workspaceSlug: string, pageId: string): Promise<TPageReaction[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/pages/${pageId}/reactions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkspaceReaction(
    workspaceSlug: string,
    pageId: string,
    data: Partial<TPageReaction>
  ): Promise<TPageReaction> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/reactions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeWorkspaceReaction(workspaceSlug: string, pageId: string, reaction: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/pages/${pageId}/reactions/${reaction}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
