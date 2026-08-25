/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 12, feature 4 - the ONE piece of this feature that has to run
 * on the MAIN thread, not inside the worker: telling apart a genuine
 * network-level failure (no response at all - offline, DNS black hole,
 * VPN drop) from a real validation error (4xx, a response WAS received)
 * at the exact call sites this feature patches (`base-issues.store.ts`'s
 * `issueUpdate`/`createIssue`, `comment.store.ts`'s
 * `createComment`/`updateComment`, `base-page.ts`'s `update`) - those
 * still call the normal `axios`-based services directly when online (see
 * `README.md`'s "Where the pieces run" section for why this feature
 * deliberately does NOT reroute the online path through the queue), so
 * THEIR catch blocks need this distinction to decide "durably queue and
 * keep the optimistic UI" vs "revert, this was a real rejection".
 *
 * Written as a loose duck-type check on `unknown` rather than importing
 * `axios`'s own `isAxiosError` - this package has no dependency on
 * `axios` (or any HTTP client) and there's no reason to add one just for
 * a single `instanceof`-ish check; every meaningful case is covered by
 * checking for the shape `axios` itself produces on a rejected request
 * (see https://axios-http.com/docs/handling_errors) : `error.response`
 * is `undefined` when no response was ever received.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("response" in error && error.response !== undefined) return false; // a real HTTP response came back - not a network failure
  if ("code" in error && typeof error.code === "string") {
    return ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT", "ERR_CANCELED"].includes(error.code);
  }
  // No `response` and no recognizable `code` - most likely a bare
  // `TypeError` from a native `fetch` rejecting outright (offline), which
  // is exactly the case this exists to catch. Defaults to "yes,
  // network failure" rather than "no" - the safer default for THIS
  // specific decision is to keep the user's optimistic local change
  // (durably queued for retry) rather than silently reverting it on an
  // error shape this function doesn't recognize.
  return true;
}
