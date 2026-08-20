/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { TPageCollection, TPageCollectionReorderPayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Category 10, feature 4 ("Wiki workspace en GA") - Collections (folders)
 * used to organize workspace-level Wiki pages. Mirrors
 * `WorkspacePageCollectionViewSet` (apps/api/plane/app/views/page/workspace.py).
 */
export class PageCollectionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchAll(workspaceSlug: string): Promise<TPageCollection[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/page-collections/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: Partial<TPageCollection>): Promise<TPageCollection> {
    return this.post(`/api/workspaces/${workspaceSlug}/page-collections/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, collectionId: string, data: Partial<TPageCollection>): Promise<TPageCollection> {
    return this.patch(`/api/workspaces/${workspaceSlug}/page-collections/${collectionId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Exigence 7 - `cascade=false` (default) promotes direct children to the
   * deleted Collection's own parent (or the Wiki root); `cascade=true`
   * soft-deletes the whole subtree of Collections and pages. Callers MUST
   * surface an explicit confirmation before passing `cascade: true` - see
   * `DeleteCollectionModal`.
   */
  async remove(workspaceSlug: string, collectionId: string, cascade: boolean): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/page-collections/${collectionId}/`, undefined, {
      params: { cascade },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reorder(
    workspaceSlug: string,
    collectionId: string,
    data: TPageCollectionReorderPayload
  ): Promise<TPageCollection> {
    return this.post(`/api/workspaces/${workspaceSlug}/page-collections/${collectionId}/reorder/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
