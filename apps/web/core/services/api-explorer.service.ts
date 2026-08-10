/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { AxiosRequestConfig, AxiosResponse } from "axios";
// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TApiExplorerEphemeralToken,
  TApiExplorerEphemeralTokenRequest,
  TOpenAPIDocument,
  TWebhookTestSendRequest,
  TWebhookTestSendResponse,
  TWorkspaceAPIExplorerSettings,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TApiExplorerCallResult<T> = {
  status: number;
  statusText: string;
  data: T;
  headers: Record<string, string>;
  durationMs: number;
  error?: string;
};

/** Marks every real call the explorer makes on the user's behalf, so the
 * backend's `APIExplorerActivityLogMiddleware` can log it distinctly from
 * third-party integration traffic (spec exigence 12,
 * docs/feature-specs/08-api-webhooks-cli.md "6. Explorateur d'API
 * interactif" in plane-selfhost). Deliberately NOT sent on the two
 * explorer-management calls below (`getSettings`/`updateSettings`,
 * `testWebhook`) - those aren't "the API being explored", they're the
 * explorer's own session-authenticated configuration surface.
 */
const EXPLORER_SOURCE_HEADER = { "X-Plane-Source": "api-explorer" };

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers) return {};
  // Axios 1.x wraps response headers in an `AxiosHeaders` instance; both
  // it and a plain object survive a `toJSON`/spread round-trip fine, but
  // only the former actually has `.toJSON`.
  const maybeToJSON = (headers as { toJSON?: () => Record<string, string> }).toJSON;
  const plain = typeof maybeToJSON === "function" ? maybeToJSON.call(headers) : (headers as Record<string, string>);
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(plain)) {
    if (value === undefined || value === null) continue;
    normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

/**
 * Service for the interactive API Explorer (category 8, feature 6) - see
 * docs/feature-specs/08-api-webhooks-cli.md ("6. Explorateur d'API
 * interactif") in plane-selfhost.
 *
 * `getSettings`/`updateSettings` hit the session-authenticated workspace
 * settings endpoint (`WorkspaceAPIExplorerSettingsEndpoint`, `plane.app`).
 * `getSchema`/`mintEphemeralToken`/`executeRequest` hit token-authenticated
 * surfaces instead - the explorer always executes real calls using a real
 * `APIToken` (the user's own pasted one, or a freshly-minted ephemeral
 * one), sent as `X-Api-Key`, never the session cookie. `validateStatus: ()
 * => true` is used on all three for the same two reasons documented on
 * the near-identical flexible-query precedent this session
 * (docs/feature-specs/08-api-webhooks-cli.md "1. Couche de requetes
 * flexible facon GraphQL"): (1) a 404 ("feature disabled"), 401/403
 * (invalid/read-only token), or any other structured error body needs to
 * be read and displayed, not discarded into a generic thrown error - this
 * explorer's entire purpose is showing the caller exactly what the real
 * API returned, success or failure (spec exigence 15: never a fake
 * success); and (2) this app's own `APIService` (./api.service.ts) has a
 * response interceptor that force-redirects the whole tab to `/` on ANY
 * 401 (treating it as "your session expired") - since every call below
 * intentionally sends a user-supplied token as `X-Api-Key` instead of
 * relying on the session cookie, a mistyped/revoked/expired token must
 * surface as an inline error in the explorer, not silently sign the user
 * out of the entire app.
 */
export class ApiExplorerService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSettings(workspaceSlug: string): Promise<TWorkspaceAPIExplorerSettings> {
    return this.get(`/api/workspaces/${workspaceSlug}/api-explorer-settings/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateSettings(
    workspaceSlug: string,
    data: Partial<Pick<TWorkspaceAPIExplorerSettings, "is_enabled" | "allow_members_execute">>
  ): Promise<TWorkspaceAPIExplorerSettings> {
    return this.patch(`/api/workspaces/${workspaceSlug}/api-explorer-settings/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getSchema(workspaceSlug: string, apiToken: string): Promise<TApiExplorerCallResult<TOpenAPIDocument>> {
    return this.timedRequest({
      method: "get",
      url: `/api/v1/workspaces/${workspaceSlug}/api-explorer/schema/`,
      headers: { "X-Api-Key": apiToken },
    });
  }

  async mintEphemeralToken(
    workspaceSlug: string,
    apiToken: string,
    body: TApiExplorerEphemeralTokenRequest
  ): Promise<TApiExplorerCallResult<TApiExplorerEphemeralToken>> {
    return this.timedRequest({
      method: "post",
      url: `/api/v1/workspaces/${workspaceSlug}/api-explorer/tokens/ephemeral/`,
      data: body,
      headers: { "X-Api-Key": apiToken },
    });
  }

  /**
   * The request-builder's core primitive - fires an arbitrary call
   * against one of the ~180 real REST endpoints described by the schema,
   * using the caller-supplied token. `relativeUrl` is expected to already
   * have its `{path_param}` placeholders substituted and its query string
   * appended (see `substitutePathParams`/`buildQueryString` in
   * `apps/web/core/components/api-explorer/utils.ts`).
   */
  async executeRequest<T = unknown>(
    apiToken: string,
    method: string,
    relativeUrl: string,
    body?: unknown
  ): Promise<TApiExplorerCallResult<T>> {
    return this.timedRequest<T>({
      method,
      url: relativeUrl,
      data: body,
      headers: { "X-Api-Key": apiToken, ...EXPLORER_SOURCE_HEADER },
    });
  }

  /** Session-authenticated - see `WebhookTestSendEndpoint`, Admin only. */
  async testWebhook(
    workspaceSlug: string,
    webhookId: string,
    body: TWebhookTestSendRequest
  ): Promise<TWebhookTestSendResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/webhooks/${webhookId}/test/`, body)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Shared timing + normalization wrapper around the raw axios `request`
   * escape hatch (`APIService.request`) - every token-authenticated call
   * above needs the same three things: wall-clock latency (there's no
   * exact server-side timing header to read instead), lower-cased response
   * headers (so `X-RateLimit-*` lookups don't have to care about casing),
   * and a result shape that surfaces network failures (DNS/timeout/CORS -
   * no HTTP response at all) the same way as a normal HTTP error response,
   * rather than throwing - this is a response *viewer*, it must be able to
   * render "the request never got a response" as cleanly as "the request
   * got a 500".
   */
  private async timedRequest<T>(config: AxiosRequestConfig): Promise<TApiExplorerCallResult<T>> {
    const startedAt = performance.now();
    try {
      const response: AxiosResponse<T> = await this.request({ ...config, validateStatus: () => true });
      return {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: normalizeHeaders(response.headers),
        durationMs: Math.round(performance.now() - startedAt),
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "The request could not be sent (network error or timeout).";
      return {
        status: 0,
        statusText: "",
        data: undefined as unknown as T,
        headers: {},
        durationMs: Math.round(performance.now() - startedAt),
        error: message,
      };
    }
  }
}
