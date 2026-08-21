/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { TPageSubscriber, TPageSubscriptionStatus } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Category 10, feature 5 ("Abonnements/notifications par page") - mirrors
 * `PageReactionService`'s own dual-scope shape (@/services/page/page-
 * reaction.service): every method has a project-scoped variant
 * (`.../projects/{project_id}/pages/{page_id}/subscribe|subscribers/`) and a
 * `*Workspace*`-suffixed workspace-scoped sibling (`.../pages/{page_id}/
 * subscribe|subscribers/`, no `project_id` segment - category 10 feature 4,
 * Wiki GA), matching the backend's `WorkspacePageSubscriptionViewSet`
 * subclassing `PageSubscriptionViewSet` instead of duplicating it.
 */
export class PageSubscriptionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // --- project-scoped -------------------------------------------------

  async getSubscriptionStatus(
    workspaceSlug: string,
    projectId: string,
    pageId: string
  ): Promise<TPageSubscriptionStatus> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/subscribe/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async subscribe(workspaceSlug: string, projectId: string, pageId: string): Promise<TPageSubscriptionStatus> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/subscribe/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unsubscribe(workspaceSlug: string, projectId: string, pageId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/subscribe/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listSubscribers(workspaceSlug: string, projectId: string, pageId: string): Promise<TPageSubscriber[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/subscribers/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- workspace-scoped (category 10, feature 4 - "Wiki workspace en GA") --

  async getWorkspaceSubscriptionStatus(workspaceSlug: string, pageId: string): Promise<TPageSubscriptionStatus> {
    return this.get(`/api/workspaces/${workspaceSlug}/pages/${pageId}/subscribe/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async subscribeWorkspacePage(workspaceSlug: string, pageId: string): Promise<TPageSubscriptionStatus> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/subscribe/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unsubscribeWorkspacePage(workspaceSlug: string, pageId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/pages/${pageId}/subscribe/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listWorkspaceSubscribers(workspaceSlug: string, pageId: string): Promise<TPageSubscriber[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/pages/${pageId}/subscribers/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
