/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 5 ("Role Owner dedie + Team/Project Owner
 * delegue") - client for the Project Owner assign/revoke endpoint
 * (`ProjectOwnerEndpoint`, apps/api/plane/app/views/project/owner.py).
 * Restricted server-side to the workspace Owner or a workspace Admin; the
 * target must already hold project role Admin (20).
 */
import { API_BASE_URL } from "@plane/constants";
import type { TProjectMembership } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectOwnerService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** POST /api/workspaces/<slug>/projects/<project_id>/owner/ */
  async assign(workspaceSlug: string, projectId: string, memberId: string): Promise<TProjectMembership> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/owner/`, { member_id: memberId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** DELETE /api/workspaces/<slug>/projects/<project_id>/owner/ */
  async revoke(workspaceSlug: string, projectId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/owner/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const projectOwnerService = new ProjectOwnerService();

export default projectOwnerService;
