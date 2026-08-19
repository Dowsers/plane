/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TDuplicateDetectionBackfillPayload,
  TDuplicateDetectionBackfillResponse,
  TProjectDuplicateDetectionConfig,
  TProjectDuplicateDetectionConfigPayload,
  TWorkspaceDuplicateDetectionConfig,
  TWorkspaceDuplicateDetectionConfigPayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost) workspace +
 * project settings. Backend:
 * `WorkspaceDuplicateDetectionConfigEndpoint`/
 * `ProjectDuplicateDetectionConfigEndpoint`/
 * `WorkspaceDuplicateDetectionBackfillEndpoint`
 * (apps/api/plane/app/views/duplicate_detection_config.py) - Admin only for
 * every verb, including read, on both the workspace and project resources.
 *
 * Unlike `is_ai_triage_enabled` (the sibling category 9 feature's
 * workspace-level master switch, wired directly through
 * `useWorkspace()`/`updateWorkspace()` since it's a plain field on the
 * generic workspace serializer), this feature's workspace config has its
 * OWN dedicated endpoint - the backend validates
 * `duplicate_detection_similarity_threshold` (must be in [0, 1]) and
 * `duplicate_detection_scope` (must be a real `DuplicateDetectionScope`
 * choice) server-side, so all three fields are read/written through this
 * service exclusively, never through the generic workspace object.
 */
export class DuplicateDetectionConfigService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getWorkspaceConfig(workspaceSlug: string): Promise<TWorkspaceDuplicateDetectionConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/duplicate-detection-config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceConfig(
    workspaceSlug: string,
    data: TWorkspaceDuplicateDetectionConfigPayload
  ): Promise<TWorkspaceDuplicateDetectionConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/duplicate-detection-config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectConfig(workspaceSlug: string, projectId: string): Promise<TProjectDuplicateDetectionConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/duplicate-detection-config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProjectConfig(
    workspaceSlug: string,
    projectId: string,
    data: TProjectDuplicateDetectionConfigPayload
  ): Promise<TProjectDuplicateDetectionConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/duplicate-detection-config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Enqueues the existing `backfill_issue_embeddings_batch` task - no job
   * id/progress is returned, so callers should only ever surface a simple
   * confirmation, never a progress bar the backend can't feed. */
  async triggerBackfill(
    workspaceSlug: string,
    data: TDuplicateDetectionBackfillPayload = {}
  ): Promise<TDuplicateDetectionBackfillResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/duplicate-detection-config/backfill/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }
}
