/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TDigestPreference,
  TDigestPreferencePayload,
  TDigestPreviewResponse,
  TDigestRunDetail,
  TPaginatedResponse,
  TDigestRun,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9 (AI features, docs/feature-specs/09-ai-features.md
 * in plane-selfhost), feature 5 - "Digest periodique automatise". Backend:
 * `UserDigestPreferenceEndpoint`/`UserDigestListEndpoint`/
 * `UserDigestDetailEndpoint`/`UserDigestPreviewEndpoint`
 * (apps/api/plane/app/views/digest.py) - all four are personal (any active
 * Admin/Member/Guest), never Admin-gated. See
 * `WorkspaceDigestSettingsService` for the separate Admin-only workspace
 * kill-switch/LLM-enrichment settings.
 *
 * `listDigests` follows this fork's cursor-pagination convention
 * (`TPaginatedResponse<T>`, packages/types/src/pagination.ts) - the backend
 * uses `self.paginate(...)` on `UserDigestListEndpoint`.
 */
export class DigestService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getPreferences(workspaceSlug: string): Promise<TDigestPreference> {
    return this.get(`/api/workspaces/${workspaceSlug}/users/me/digest-preferences/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePreferences(workspaceSlug: string, data: TDigestPreferencePayload): Promise<TDigestPreference> {
    return this.patch(`/api/workspaces/${workspaceSlug}/users/me/digest-preferences/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listDigests(workspaceSlug: string, cursor?: string): Promise<TPaginatedResponse<TDigestRun[]>> {
    return this.get(`/api/workspaces/${workspaceSlug}/users/me/digests/`, {
      params: cursor ? { cursor } : undefined,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getDigest(workspaceSlug: string, digestId: string): Promise<TDigestRunDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/users/me/digests/${digestId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** `POST .../digests/preview/` - rate-limited (3/hour/user). Rejects with
   * `{ status: 429, ...error?.response?.data }` on throttling so callers can
   * show a specific "try again later" message rather than a generic error
   * toast - same `{ ...data, status }` splicing convention as
   * `DuplicateDetectionConfigService.triggerBackfill`. */
  async sendPreview(workspaceSlug: string): Promise<TDigestPreviewResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/users/me/digests/preview/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }
}
