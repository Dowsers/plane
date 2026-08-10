/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TApiExplorerTokenScope } from "@plane/types";

/**
 * The token actually used to authenticate real calls the explorer makes
 * on the user's behalf (`X-Api-Key`) - either pasted verbatim by the user
 * (`scope` unknown - Plane never returns an existing token's secret again
 * after creation, so there is no way to look up its real scope from here)
 * or minted through the ephemeral-token endpoint (`scope` known, since
 * that endpoint echoes it back).
 */
export type TActiveToken = {
  value: string;
  scope: TApiExplorerTokenScope | null;
  source: "pasted" | "ephemeral";
  expiresAt: string | null;
};

/** A fully-resolved, ready-to-fire request built by the request-builder -
 * handed up to the root so it can decide whether a mutating-call
 * confirmation is required before actually calling the service. */
export type TExecutePayload = {
  method: string;
  /** Relative URL, path params substituted and query string appended. */
  url: string;
  /** Raw JSON text, already parse-validated by the request-builder - `null` when the operation has no body. */
  bodyText: string | null;
  pathValues: Record<string, string>;
  queryValues: Record<string, string>;
  endpointId: string;
};

/** Seed used to re-populate the request-builder's draft state when the
 * user replays a history entry - see history-panel.tsx / root.tsx. */
export type TReplaySeed = {
  pathValues: Record<string, string>;
  queryValues: Record<string, string>;
  bodyText: string | null;
  /** Incremented on every replay so a `useEffect` fires even when
   * replaying the same endpoint twice in a row. */
  nonce: number;
};
