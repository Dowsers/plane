/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  TPageComment,
  TPageCommentCreatePayload,
  TPageCommentReaction,
  TPageCommentReplyPayload,
  TPageCommentUpdatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TPageCommentListParams = {
  resolved?: boolean;
  orphaned?: boolean;
};

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - mirrors `PageReactionService`'s
 * own dual-scope shape (@/services/page/page-reaction.service): every
 * method has a project-scoped variant (`.../projects/{project_id}/pages/{page_id}/comments/...`)
 * and a `*Workspace*`-suffixed workspace-scoped sibling
 * (`.../pages/{page_id}/comments/...`, no `project_id` segment - category
 * 10 feature 4, Wiki GA), matching the backend's
 * `WorkspacePageCommentViewSet`/`WorkspacePageCommentReactionViewSet`
 * subclassing `PageCommentViewSet`/`PageCommentReactionViewSet` instead of
 * duplicating them.
 */
export class PageCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // --- project-scoped -------------------------------------------------

  async listComments(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    params?: TPageCommentListParams
  ): Promise<TPageComment[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createComment(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    data: TPageCommentCreatePayload
  ): Promise<TPageComment> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateComment(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    commentId: string,
    data: TPageCommentUpdatePayload
  ): Promise<TPageComment> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/${commentId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteComment(workspaceSlug: string, projectId: string, pageId: string, commentId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async replyToComment(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    threadId: string,
    data: TPageCommentReplyPayload
  ): Promise<TPageComment> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/${threadId}/replies/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async resolveComment(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    threadId: string
  ): Promise<TPageComment> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/${threadId}/resolve/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reopenComment(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    threadId: string
  ): Promise<TPageComment> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/${threadId}/reopen/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createCommentReaction(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    commentId: string,
    data: { reaction: string }
  ): Promise<TPageCommentReaction> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/${commentId}/reactions/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeCommentReaction(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    commentId: string,
    reaction: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/${commentId}/reactions/${reaction}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- workspace-scoped (category 10, feature 4 - "Wiki workspace en GA") --

  async listWorkspaceComments(
    workspaceSlug: string,
    pageId: string,
    params?: TPageCommentListParams
  ): Promise<TPageComment[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkspaceComment(
    workspaceSlug: string,
    pageId: string,
    data: TPageCommentCreatePayload
  ): Promise<TPageComment> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceComment(
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    data: TPageCommentUpdatePayload
  ): Promise<TPageComment> {
    return this.patch(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${commentId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkspaceComment(workspaceSlug: string, pageId: string, commentId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async replyToWorkspaceComment(
    workspaceSlug: string,
    pageId: string,
    threadId: string,
    data: TPageCommentReplyPayload
  ): Promise<TPageComment> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${threadId}/replies/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async resolveWorkspaceComment(workspaceSlug: string, pageId: string, threadId: string): Promise<TPageComment> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${threadId}/resolve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reopenWorkspaceComment(workspaceSlug: string, pageId: string, threadId: string): Promise<TPageComment> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${threadId}/reopen/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkspaceCommentReaction(
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    data: { reaction: string }
  ): Promise<TPageCommentReaction> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${commentId}/reactions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeWorkspaceCommentReaction(
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    reaction: string
  ): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${commentId}/reactions/${reaction}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
