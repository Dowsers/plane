/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 4 - "Moteur de synchronisation local-first/
 * offline pour le web".
 *
 * This is a REAL dedicated Web Worker (exigence 3's "un worker de
 * synchronisation (Web Worker...)", and the user's own explicit choice
 * of the full-spec option over an in-page scheduler) - Vite's built-in
 * `new Worker(new URL(...), { type: "module" })` handling (no extra
 * plugin needed, see this feature's own `README.md`) bundles this file
 * as a separate module graph that runs on its own thread, off the main
 * UI thread.
 *
 * Deliberately thin: all the actual logic (IndexedDB, HTTP replay,
 * backoff, Web Locks, BroadcastChannel, conflict resolution) lives in the
 * framework/runtime-agnostic `@plane/sync-engine` package's
 * `SyncEngineCore` class - this file only bridges the worker's own
 * `message` event / `self.postMessage` to it, so `SyncEngineCore` itself
 * stays independent
 * of any Worker-global API and is trivially unit-testable outside a
 * browser if ever needed.
 */

import { SyncEngineCore } from "@plane/sync-engine";
import type { TMainToWorkerMessage, TWorkerToMainMessage } from "@plane/sync-engine";

const core = new SyncEngineCore((message: TWorkerToMainMessage) => {
  // `DedicatedWorkerGlobalScope.postMessage` (this context) has no
  // `targetOrigin` parameter at all - unlike `Window.postMessage`, a
  // dedicated Worker's message channel is private to the tab that
  // spawned it, so the generic `require-post-message-target-origin`
  // lint rule's suggested fix doesn't apply to this API shape.
  // eslint-disable-next-line unicorn/require-post-message-target-origin
  self.postMessage(message);
});

self.addEventListener("message", (event: MessageEvent<TMainToWorkerMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      void core.init(message.config);
      break;
    case "enqueue":
      void core.enqueue(message.entry);
      break;
    case "network-status":
      core.setNetworkStatus(message.isOnline);
      break;
    case "flush-now":
      void core.flush();
      break;
    case "retry-entry":
      void core.retryEntry(message.id);
      break;
    case "retry-all-failed":
      void core.retryAllFailed();
      break;
    case "pull-delta-now":
      void core.pullDeltaNow();
      break;
    case "pull-accessible-ids-now":
      void core.pullAccessibleIdsNow();
      break;
    case "touch-project":
      void core.touchProject(message.projectId);
      break;
    case "destroy":
      core.destroy();
      break;
    default:
      break;
  }
});
