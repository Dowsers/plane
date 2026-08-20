/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane types
import { API_BASE_URL } from "@plane/constants";
import type { TPageVersion } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Category 10, feature 4 ("Wiki workspace en GA") - mirrors
 * `ProjectPageVersionService`, scoped to the workspace-level version
 * endpoints (`WorkspacePageVersionEndpoint`,
 * apps/api/plane/app/views/page/workspace.py).
 */
export class WorkspacePageVersionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchAllVersions(workspaceSlug: string, pageId: string): Promise<TPageVersion[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/pages/${pageId}/versions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchVersionById(workspaceSlug: string, pageId: string, versionId: string): Promise<TPageVersion> {
    return this.get(`/api/workspaces/${workspaceSlug}/pages/${pageId}/versions/${versionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * No `WorkspacePageVersionEndpoint` restore action exists server-side
   * (mirrors a pre-existing gap on the project-scoped
   * `PageVersionEndpoint` too - `ProjectPageVersionService.restoreVersion`
   * calls the same never-registered shape). Kept for type-shape parity
   * with `TPageRootHandlers.restoreVersion`; in practice version restore
   * is done purely client-side (`PageRoot.handleRestoreVersion` sets the
   * editor value directly and relies on the normal autosave path), so this
   * method is never actually invoked from the render tree.
   */
  async restoreVersion(workspaceSlug: string, pageId: string, versionId: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/versions/${versionId}/restore/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
