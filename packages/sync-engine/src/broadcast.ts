/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { broadcastChannelName } from "./types";

/**
 * Category 12, feature 4 - the other half of exigence 12's multi-tab
 * story. `locks.ts`'s Web Lock is what actually PREVENTS a double-flush;
 * this `BroadcastChannel` is purely a cross-tab NOTIFICATION bus so every
 * tab's UI (the "Syncing (n)" indicator, the offline banner, the
 * conflict toast) stays in sync even though only ONE tab's worker is
 * ever the one actually talking to the network at a given moment -
 * without this, a background tab that lost the flush-lock race would
 * never learn that the leader tab just synced/failed/remapped an id, and
 * would show a stale queue count until its own next poll.
 *
 * Also doubles as the fallback mutual-exclusion signal on browsers
 * without `navigator.locks` (see `locks.ts`) - every tab reacts to a
 * `queue-changed` broadcast by attempting its own flush, so work still
 * gets drained even without a real lock, just without the same
 * double-send guarantee (documented, not silently assumed - see
 * `README.md`).
 */

export type TBroadcastMessage =
  | { type: "queue-changed" }
  | { type: "id-remapped"; entityType: string; oldId: string; newId: string }
  | { type: "delta-applied" }
  | { type: "conflict"; entityType: string; entityId: string; field: string };

export function openBroadcastChannel(workspaceId: string): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  return new BroadcastChannel(broadcastChannelName(workspaceId));
}

export function postBroadcast(channel: BroadcastChannel | undefined, message: TBroadcastMessage): void {
  channel?.postMessage(message);
}
