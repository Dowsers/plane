/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TWorkspaceDigestSettings, TWorkspaceDigestSettingsPayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9 (AI features, docs/feature-specs/09-ai-features.md
 * in plane-selfhost), feature 5's workspace-level admin settings - the
 * `digest_feature_enabled` kill-switch and `is_digest_llm_enrichment_enabled`
 * toggle. Backend: `WorkspaceDigestSettingsEndpoint`
 * (apps/api/plane/app/views/digest.py) - `GET` allows Admin/Member, `PATCH`
 * is Admin only. Kept as its own dedicated service (rather than folded into
 * the generic `useWorkspace()`/`updateWorkspace()` path) since it has its
 * own endpoint, same reasoning as `DuplicateDetectionConfigService`.
 */
export class WorkspaceDigestSettingsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSettings(workspaceSlug: string): Promise<TWorkspaceDigestSettings> {
    return this.get(`/api/workspaces/${workspaceSlug}/digest-settings/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateSettings(
    workspaceSlug: string,
    data: TWorkspaceDigestSettingsPayload
  ): Promise<TWorkspaceDigestSettings> {
    return this.patch(`/api/workspaces/${workspaceSlug}/digest-settings/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
