import { describe, expect, it, vi } from "vitest";
import { PlaneClient } from "../src/client.js";
import { NetworkError } from "../src/errors.js";

// Hand-rolled fetch stub, injected via PlaneClientOptions.fetchImpl, instead
// of an HTTP-mocking library - this monorepo's root pnpm.overrides pins
// path-to-regexp to 0.1.13 (Express 4 compat elsewhere in the workspace),
// which breaks msw's/nock's own routing internals. See the fetchImpl
// docstring in src/client.ts.
function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

const API_URL = "https://plane.test";

describe("PlaneClient auth + requests", () => {
  it("sends the X-Api-Key header (not Authorization: Bearer) and a plane-cli User-Agent", async () => {
    let seenRequest: Request | undefined;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seenRequest = new Request(input, init);
      return jsonResponse({ id: "u1", email: "a@b.com" });
    }) as unknown as typeof fetch;

    const client = new PlaneClient({ apiUrl: API_URL, token: "plane_api_test", fetchImpl });
    const { data } = await client.get<{ id: string }>("/api/v1/users/me/");

    expect(data.id).toBe("u1");
    expect(seenRequest?.headers.get("x-api-key")).toBe("plane_api_test");
    expect(seenRequest?.headers.get("user-agent")).toMatch(/^plane-cli\//);
    expect(seenRequest?.url).toBe(`${API_URL}/api/v1/users/me/`);
  });

  it("classifies non-2xx responses through classifyHttpError (e.g. 403 -> AuthError)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ detail: "You do not have permission." }, { status: 403 })
    ) as unknown as typeof fetch;

    const client = new PlaneClient({ apiUrl: API_URL, token: "t", fetchImpl });
    await expect(client.get("/api/v1/workspaces/acme/projects/")).rejects.toMatchObject({
      exitCode: 3,
      message: expect.stringContaining("You do not have permission."),
    });
  });

  it("propagates connection failures as NetworkError instead of an unhandled rejection", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const client = new PlaneClient({ apiUrl: API_URL, token: "t", fetchImpl });
    await expect(client.get("/api/v1/users/me/")).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("PlaneClient rate-limit backoff (exigence 8)", () => {
  it("reads Retry-After, waits, and retries automatically on 429", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        return jsonResponse(
          { error_code: "rate_limit_exceeded", retry_after: 0 },
          { status: 429, headers: { "Retry-After": "0" } }
        );
      }
      return jsonResponse({ id: "u1" });
    }) as unknown as typeof fetch;

    const onRateLimited = vi.fn();
    const client = new PlaneClient({ apiUrl: API_URL, token: "t", fetchImpl, onRateLimited });
    const { data } = await client.get<{ id: string }>("/api/v1/users/me/");

    expect(data.id).toBe("u1");
    expect(attempts).toBe(2);
    expect(onRateLimited).toHaveBeenCalledWith({ retryAfterSeconds: 0, attempt: 1, maxAttempts: 5 });
  });

  it("falls back to the JSON body's retry_after when there is no Retry-After header", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts++;
      if (attempts === 1) return jsonResponse({ error_code: "rate_limit_exceeded", retry_after: 0 }, { status: 429 });
      return jsonResponse({ id: "u1" });
    }) as unknown as typeof fetch;

    const onRateLimited = vi.fn();
    const client = new PlaneClient({ apiUrl: API_URL, token: "t", fetchImpl, onRateLimited });
    await client.get("/api/v1/users/me/");

    expect(onRateLimited).toHaveBeenCalledWith(expect.objectContaining({ retryAfterSeconds: 0 }));
  });

  it("gives up and throws NetworkError once maxRateLimitRetries is exhausted, never bypassing the server", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error_code: "rate_limit_exceeded", retry_after: 0 }, { status: 429 })
    ) as unknown as typeof fetch;

    const client = new PlaneClient({ apiUrl: API_URL, token: "t", fetchImpl, maxRateLimitRetries: 2 });
    await expect(client.get("/api/v1/users/me/")).rejects.toBeInstanceOf(NetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it("captures X-RateLimit-* response headers for `plane doctor`", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { id: "u1" },
        { headers: { "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": "59", "X-RateLimit-Reset": "1700000000" } }
      )
    ) as unknown as typeof fetch;

    const client = new PlaneClient({ apiUrl: API_URL, token: "t", fetchImpl });
    await client.get("/api/v1/users/me/");
    expect(client.lastRateLimit).toEqual({ limit: 60, remaining: 59, reset: 1700000000 });
  });
});

describe("PlaneClient.paginateAll (exigence 5)", () => {
  it("returns only the first page and reports truncated=true when `all` is false", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: [{ id: "1" }],
        next_cursor: "1:1:0",
        prev_cursor: "1:0:1",
        next_page_results: true,
        prev_page_results: false,
        count: 1,
        total_count: 2,
        total_pages: 2,
      })
    ) as unknown as typeof fetch;

    const client = new PlaneClient({ apiUrl: API_URL, token: "t", fetchImpl });
    const { results, truncated } = await client.paginateAll(
      "/api/v1/workspaces/acme/projects/",
      {},
      { perPage: 1, all: false }
    );
    expect(results).toEqual([{ id: "1" }]);
    expect(truncated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows next_cursor across pages until next_page_results is false when `all` is true", async () => {
    const seenCursors: (string | null)[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const cursor = url.searchParams.get("cursor");
      seenCursors.push(cursor);
      if (!cursor) {
        return jsonResponse({
          results: [{ id: "1" }],
          next_cursor: "1:1:0",
          prev_cursor: "1:0:1",
          next_page_results: true,
          prev_page_results: false,
          count: 1,
          total_count: 2,
          total_pages: 2,
        });
      }
      return jsonResponse({
        results: [{ id: "2" }],
        next_cursor: "1:2:0",
        prev_cursor: "1:1:1",
        next_page_results: false,
        prev_page_results: true,
        count: 1,
        total_count: 2,
        total_pages: 2,
      });
    }) as unknown as typeof fetch;

    const client = new PlaneClient({ apiUrl: API_URL, token: "t", fetchImpl });
    const { results, truncated } = await client.paginateAll(
      "/api/v1/workspaces/acme/projects/",
      {},
      { perPage: 1, all: true }
    );
    expect(results).toEqual([{ id: "1" }, { id: "2" }]);
    expect(truncated).toBe(false);
    expect(seenCursors).toEqual([null, "1:1:0"]);
  });
});
