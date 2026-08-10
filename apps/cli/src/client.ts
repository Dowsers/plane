// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.
//
// Thin HTTP client for the real plane.api REST surface - there is no
// distributable Node/Python SDK in this monorepo to build on top of (see
// docs/feature-specs/08-api-webhooks-cli.md, section 5, in plane-selfhost:
// the spec's "2 official SDKs already exist" claim doesn't hold up in this
// checkout), so this talks to `/api/v1/...` directly with `fetch`.

import { CLI_VERSION } from "./version.js";
import { NetworkError, classifyHttpError } from "./errors.js";

// apps/api/plane/api/middleware/api_authentication.py: APIKeyAuthentication
// reads exactly this header - not "Authorization: Bearer".
const API_KEY_HEADER = "X-Api-Key";

export const USER_AGENT = `plane-cli/${CLI_VERSION}`;

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

/**
 * Matches apps/api/plane/utils/paginator.py's BasePaginator.paginate
 * response shape exactly - real field names (`next_cursor`,
 * `next_page_results`), not GraphQL-style cursor conventions.
 */
export interface PaginatedResponse<T> {
  results: T[];
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
  count: number;
  total_count: number;
  total_pages: number;
}

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: number;
}

export interface RateLimitedEvent {
  retryAfterSeconds: number;
  attempt: number;
  maxAttempts: number;
}

export interface PlaneClientOptions {
  apiUrl: string;
  token: string;
  /** Retries before giving up on a 429 and surfacing a NetworkError - never bypasses the server's own limit, only waits it out. */
  maxRateLimitRetries?: number;
  onRateLimited?: (event: RateLimitedEvent) => void;
  /**
   * Defaults to the global `fetch`. Overridable purely so tests can inject
   * a hand-rolled fake instead of pulling in an HTTP-mocking library - this
   * monorepo's root `pnpm.overrides` pins `path-to-regexp` to `0.1.13`
   * (for Express 4 compatibility elsewhere in the workspace), which breaks
   * msw's own routing internals; nock sits on the same broken dependency
   * via @mswjs/interceptors. Rather than touch a workspace-wide override
   * for one small package's tests, request/response mocking here is just
   * plain functions - see tests/client.test.ts.
   */
  fetchImpl?: typeof fetch;
}

export class PlaneClient {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly maxRateLimitRetries: number;
  private readonly onRateLimited: PlaneClientOptions["onRateLimited"];
  private readonly fetchImpl: typeof fetch;

  /** Populated from the X-RateLimit-* headers of the most recent response, for `plane doctor`. */
  lastRateLimit: RateLimitInfo = {};

  constructor(options: PlaneClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.maxRateLimitRetries = options.maxRateLimitRetries ?? 5;
    this.onRateLimited = options.onRateLimited;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const url = new URL(this.apiUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private captureRateLimit(headers: Headers): void {
    // Header names come from apps/api/plane/api/rate_limit.py /
    // finalize_response in apps/api/plane/api/views/base.py - do not
    // guess GraphQL-style names here.
    const limit = headers.get("x-ratelimit-limit");
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    this.lastRateLimit = {
      limit: limit ? Number(limit) : undefined,
      remaining: remaining ? Number(remaining) : undefined,
      reset: reset ? Number(reset) : undefined,
    };
  }

  async request<T>(
    method: string,
    path: string,
    options: { query?: QueryParams; body?: unknown } = {}
  ): Promise<{ data: T; headers: Headers }> {
    const url = this.buildUrl(path, options.query);
    let attempt = 0;

    // Every await below is a genuine sequential dependency, not an
    // opportunity to parallelize: a retry must wait for the server's own
    // Retry-After before firing again (exigence 8 - never hammer through
    // a 429), and there is exactly one in-flight request at a time by
    // design.
    /* eslint-disable no-await-in-loop */
    for (;;) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            [API_KEY_HEADER]: this.token,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      } catch (err) {
        throw new NetworkError(`Could not reach ${this.apiUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }

      this.captureRateLimit(response.headers);

      if (response.status === 429) {
        const body = await safeJson(response);
        const retryAfterSeconds = parseRetryAfter(response, body);
        if (attempt >= this.maxRateLimitRetries) {
          throw new NetworkError(
            `Still rate limited after ${this.maxRateLimitRetries} retries - giving up rather than hammer the server further. Try again later or reduce request volume/concurrency.`
          );
        }
        attempt++;
        this.onRateLimited?.({ retryAfterSeconds, attempt, maxAttempts: this.maxRateLimitRetries });
        await sleep(retryAfterSeconds * 1000);
        continue;
      }

      const body = await safeJson(response);
      if (!response.ok) {
        throw classifyHttpError(response.status, body);
      }
      return { data: body as T, headers: response.headers };
    }
    /* eslint-enable no-await-in-loop */
  }

  get<T>(path: string, query?: QueryParams): Promise<{ data: T; headers: Headers }> {
    return this.request<T>("GET", path, { query });
  }

  post<T>(path: string, body?: unknown): Promise<{ data: T; headers: Headers }> {
    return this.request<T>("POST", path, { body });
  }

  patch<T>(path: string, body?: unknown): Promise<{ data: T; headers: Headers }> {
    return this.request<T>("PATCH", path, { body });
  }

  delete<T>(path: string): Promise<{ data: T; headers: Headers }> {
    return this.request<T>("DELETE", path, {});
  }

  /**
   * Pages through a cursor-paginated list endpoint transparently
   * (exigence 5). Without `all`, returns just the first page (sized by
   * `perPage`) - callers are expected to tell the user more may exist via
   * `next_page_results`. With `all`, follows `next_cursor` until the
   * server reports no more pages.
   */
  async paginateAll<T>(
    path: string,
    query: QueryParams | undefined,
    { perPage, all }: { perPage: number; all: boolean }
  ): Promise<{ results: T[]; truncated: boolean }> {
    const results: T[] = [];
    let cursor: string | undefined;
    let truncated = false;

    // Each page's request depends on the previous page's `next_cursor` -
    // there is nothing here to parallelize.
    /* eslint-disable no-await-in-loop */
    for (;;) {
      const { data } = await this.get<PaginatedResponse<T>>(path, {
        ...query,
        per_page: perPage,
        ...(cursor ? { cursor } : {}),
      });
      results.push(...data.results);
      if (!data.next_page_results) break;
      if (!all) {
        truncated = true;
        break;
      }
      cursor = data.next_cursor;
    }
    /* eslint-enable no-await-in-loop */

    return { results, truncated };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

/** Retry-After header wins (exigence 8); falls back to the JSON body's `retry_after` (both set by apps/api/plane/api/views/base.py::handle_exception). 0 is a valid "retry immediately" value from either source, so only reject negative/non-numeric input, not zero. */
function parseRetryAfter(response: Response, body: unknown): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  }
  if (body && typeof body === "object" && "retry_after" in body) {
    const seconds = Number((body as Record<string, unknown>).retry_after);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  }
  return 5;
}
