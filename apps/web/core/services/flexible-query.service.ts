/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TFlexibleQueryRequest,
  TFlexibleQuerySchema,
  TFlexibleQueryResponse,
  TWorkspaceQuerySettings,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TFlexibleQueryCallResult<T> = {
  status: number;
  data: T;
};

/**
 * Service for the workspace-level flexible query layer (category 8,
 * feature 1) - see docs/feature-specs/08-api-webhooks-cli.md ("Couche de
 * requetes flexible facon GraphQL") in plane-selfhost.
 *
 * `getSettings`/`updateSettings` hit the session-authenticated settings
 * endpoint (`WorkspaceQuerySettingsEndpoint`, `plane.app`). `runQuery`/
 * `getSchema` hit the DIFFERENT, token-authenticated execution/introspection
 * endpoints under `/api/v1/...` (`plane.api`) - by design, matching the
 * spec's own exigence 11 ("authentification via les mecanismes existants:
 * token API personnel/workspace"). Those two calls never carry the usual
 * session cookie auth; the caller supplies one of their own personal API
 * token secrets, sent as `X-Api-Key`, exactly like an external integrator
 * would. `validateStatus: () => true` is used there for two reasons: (1) a
 * 404 ("feature disabled" - see `FlexibleQueryEndpoint`'s own `_not_found`
 * helper) or a structured 400/429/504 body needs to be read and displayed,
 * not discarded into a generic thrown error, and (2) this app's own
 * `APIService` (./api.service.ts) has a response interceptor that
 * force-redirects the whole browser tab to `/` on ANY 401 (treating it as
 * "your session expired") - since these two calls intentionally send a
 * user-pasted token as `X-Api-Key` instead of relying on the session
 * cookie, a mistyped/revoked token must surface as an inline error in the
 * tester, not silently sign the user out of the entire app.
 */
export class FlexibleQueryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSettings(workspaceSlug: string): Promise<TWorkspaceQuerySettings> {
    return this.get(`/api/workspaces/${workspaceSlug}/query-settings/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateSettings(
    workspaceSlug: string,
    data: Partial<Pick<TWorkspaceQuerySettings, "max_depth" | "max_cost" | "timeout_ms">>
  ): Promise<TWorkspaceQuerySettings> {
    return this.patch(`/api/workspaces/${workspaceSlug}/query-settings/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async runQuery(
    workspaceSlug: string,
    apiToken: string,
    body: TFlexibleQueryRequest
  ): Promise<TFlexibleQueryCallResult<TFlexibleQueryResponse | Record<string, unknown>>> {
    return this.post(`/api/v1/workspaces/${workspaceSlug}/query/`, body, {
      headers: { "X-Api-Key": apiToken },
      validateStatus: () => true,
    }).then((response) => ({ status: response.status, data: response.data }));
  }

  async getSchema(workspaceSlug: string, apiToken: string): Promise<TFlexibleQueryCallResult<TFlexibleQuerySchema>> {
    return this.get(`/api/v1/workspaces/${workspaceSlug}/query/schema/`, {
      headers: { "X-Api-Key": apiToken },
      validateStatus: () => true,
    }).then((response) => ({ status: response.status, data: response.data }));
  }
}
