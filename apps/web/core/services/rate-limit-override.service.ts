/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TApiTokenRateLimitOverridePayload, TApiTokenRateLimitOverrideResponse } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for the workspace-scoped, session-authenticated personal-API-
 * token rate-limit override (category 8, feature 2) -
 * `WorkspaceAPITokenRateLimitOverrideEndpoint`
 * (apps/api/plane/app/views/rate_limit.py), Workspace Admin only. Kept
 * separate from `@plane/services`' `APITokenService` since that service is
 * the shared, cross-app (web/space) token CRUD surface, while this single
 * action is workspace-settings-specific to `apps/web`.
 */
export class RateLimitOverrideService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async override(
    workspaceSlug: string,
    tokenId: string,
    data: TApiTokenRateLimitOverridePayload
  ): Promise<TApiTokenRateLimitOverrideResponse> {
    return this.patch(`/api/workspaces/${workspaceSlug}/api-tokens/${tokenId}/rate-limit-override/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
