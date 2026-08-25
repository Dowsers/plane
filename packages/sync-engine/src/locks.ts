/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { flushLockName } from "./types";

/**
 * Category 12, feature 4 - exigence 12 ("la file de mutation est sure en
 * cas de multiples onglets ouverts... afin d'eviter un double-flush ou
 * une double creation cote serveur").
 *
 * Each browser tab spawns its OWN dedicated Web Worker (a dedicated
 * Worker is per-tab, unlike a SharedWorker) - so mutual exclusion across
 * tabs cannot rely on "there's only one worker instance"; it has to be
 * an explicit lock every tab's worker independently attempts to acquire
 * before actually touching the network. The Web Locks API
 * (`navigator.locks`) is exposed in both `Window` and worker contexts
 * per spec, so this runs INSIDE each tab's worker directly - no
 * message-passing back to the main thread needed for the mutual-
 * exclusion itself.
 *
 * `mode: "exclusive"` + `ifAvailable: true`: a tab that can't acquire the
 * lock immediately does NOT queue and wait - it simply skips this flush
 * attempt and returns. This is deliberate: the tab currently holding the
 * lock is, by definition, already draining the SAME queue (IndexedDB
 * data is shared across tabs for the same origin+workspace), so a
 * losing tab piling up a queued lock-acquisition for later would just
 * mean redundant work once granted, not any additional safety - the
 * next periodic flush tick (or the `queue-changed` broadcast below) will
 * have it try again shortly regardless.
 */
export async function withFlushLock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T | "lock-not-acquired"> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    // No Web Locks support (older browser) - BroadcastChannel-based
    // coordination (`broadcast.ts`'s `queue-changed` signal, which every
    // tab reacts to by re-attempting its OWN flush) is the fallback;
    // this is strictly best-effort on such browsers, unlike the Locks
    // path above which is a real, spec-guaranteed mutual exclusion - see
    // `README.md`'s own disclosure on this.
    return fn();
  }
  return navigator.locks.request(flushLockName(workspaceId), { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) return "lock-not-acquired";
    return fn();
  });
}
