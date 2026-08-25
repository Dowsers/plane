/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TBroadcastMessage } from "./broadcast";
import { openBroadcastChannel, postBroadcast } from "./broadcast";
import {
  deleteEntities,
  evictLeastRecentlyViewedProjects,
  getEntity,
  touchProjectViewed,
  upsertEntities,
} from "./cache";
import type { TPlaneOfflineSyncDB } from "./db";
import { openWorkspaceDb } from "./db";
import { pullAccessibleIds, pullDelta } from "./delta";
import { recordIdMapping, resolveClientId } from "./id-map";
import { withFlushLock } from "./locks";
import {
  deleteQueueEntry,
  computeBackoffMs,
  discardMutationsForInaccessibleEntities,
  listQueueEntries,
  listSendableEntries,
  resetStrandedInFlightEntries,
  retryAllFailed as retryAllFailedEntries,
  retryEntry as retryQueueEntry,
  setStatus,
} from "./queue";
import { resolveFieldLevelConflicts } from "./conflict";
import { buildRequest } from "./request";
import type {
  TMutableSyncEntity,
  TMutationQueueEntry,
  TSyncConflict,
  TSyncEngineInitConfig,
  TSyncEntity,
  TWorkerToMainMessage,
} from "./types";

/**
 * Category 12, feature 4 - `SyncEngineCore` is the whole engine's actual
 * orchestration: draining `mutation_queue` to the real REST API (FIFO
 * per entity, dependency-aware, backed off, conflict-checked), pulling
 * the workspace delta + accessible-ids reconciliation, and the periodic
 * scheduling of both. Framework-agnostic on purpose - it only talks in
 * plain messages (`TWorkerToMainMessage`) via the `onMessage` callback
 * given to its constructor, so the thin `apps/web` Worker entry file
 * that actually instantiates this inside a real dedicated Worker just
 * has to bridge `self.onmessage`/`self.postMessage` to it (see
 * `README.md`'s "Where the pieces run" section) - this class itself has
 * no dependency on `self`/`postMessage`/any Worker-global.
 */

const FLUSH_INTERVAL_MS = 5_000;
const DELTA_POLL_INTERVAL_MS = 20_000;
/** Matches the backend's own recommended cadence, see
 * `plane.app.views.sync.WorkspaceSyncAccessibleIdsEndpoint`'s docstring. */
const ACCESSIBLE_IDS_POLL_INTERVAL_MS = 15 * 60 * 1000;

const MUTABLE_ENTITY_PROCESSING_ORDER: TMutableSyncEntity[] = ["issue", "issue_comment", "page"];
const ALL_ENTITIES: TSyncEntity[] = ["issue", "issue_comment", "page", "cycle", "module", "label", "state"];

export class SyncEngineCore {
  private db: TPlaneOfflineSyncDB | undefined;
  private config: TSyncEngineInitConfig | undefined;
  private channel: BroadcastChannel | undefined;
  private isOnline = true;
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private deltaTimer: ReturnType<typeof setInterval> | undefined;
  private accessibleIdsTimer: ReturnType<typeof setInterval> | undefined;
  private flushInProgress = false;
  private currentFlushPromise: Promise<void> | undefined;

  constructor(private readonly onMessage: (message: TWorkerToMainMessage) => void) {}

  async init(config: TSyncEngineInitConfig): Promise<void> {
    this.config = config;
    this.db = await openWorkspaceDb(config.workspaceId);
    this.channel = openBroadcastChannel(config.workspaceId);
    this.channel?.addEventListener("message", (event: MessageEvent<TBroadcastMessage>) => {
      void this.handleBroadcast(event.data);
    });

    // Category 12, feature 4 data-integrity review fix - heal any entry
    // this (or another tab's) worker left stranded at `in_flight` from a
    // previous, interrupted lifetime BEFORE anything else runs, so it's
    // eligible for the very first `flush()` below rather than being
    // invisible forever - see `resetStrandedInFlightEntries`'s own
    // docstring.
    await resetStrandedInFlightEntries(this.db);

    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.deltaTimer = setInterval(() => void this.pullDeltaAndReport(), DELTA_POLL_INTERVAL_MS);
    this.accessibleIdsTimer = setInterval(
      () => void this.pullAccessibleIdsAndReport(),
      ACCESSIBLE_IDS_POLL_INTERVAL_MS
    );

    this.onMessage({ type: "ready" });
    await this.emitQueueSnapshot();
    void this.pullAccessibleIdsAndReport();
    // Category 12, feature 4 data-integrity review fix - the delta pull
    // is explicitly AWAITED before the first flush is even attempted
    // (was previously `void`, fired concurrently with `flush()`). See
    // `reconnectAndFlush`'s own docstring for the full race this closes;
    // the same ordering applies on cold boot too, not just a genuine
    // online-transition reconnect, since a fresh `init()` has no
    // fresher-than-last-session local cache either.
    await this.pullDeltaAndReport();
    void this.flush();
  }

  /**
   * Category 12, feature 4 data-integrity review fix - `graceMs` (0 by
   * default, preserving the previous synchronous-teardown behavior for
   * any other caller) lets `SyncEngineStore.leaveWorkspace` give a flush
   * that's already mid-`fetch` a bounded chance to actually finish (and
   * correctly record its own result via `sendEntry`'s normal
   * success/failure handling) before this worker's `db`/`channel` get
   * torn out from under it, instead of the timers being cleared but the
   * in-flight request itself being abandoned at the exact moment the
   * page/tab kills the worker. Even without this, a request interrupted
   * mid-flight is no longer stranded forever either way - see
   * `resetStrandedInFlightEntries` (`queue.ts`), called on every future
   * `init()` for this workspace, in ANY tab.
   */
  async destroy(graceMs = 0): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.deltaTimer) clearInterval(this.deltaTimer);
    if (this.accessibleIdsTimer) clearInterval(this.accessibleIdsTimer);
    this.flushTimer = undefined;
    this.deltaTimer = undefined;
    this.accessibleIdsTimer = undefined;
    if (graceMs > 0 && this.currentFlushPromise) {
      await Promise.race([this.currentFlushPromise, new Promise<void>((resolve) => setTimeout(resolve, graceMs))]);
    }
    this.channel?.close();
    this.db?.close();
  }

  async enqueue(entry: TMutationQueueEntry): Promise<void> {
    if (!this.db) return;
    await this.db.put("mutation_queue", entry);
    postBroadcast(this.channel, { type: "queue-changed" });
    await this.emitQueueSnapshot();
    void this.flush();
  }

  setNetworkStatus(isOnline: boolean): void {
    const wasOffline = !this.isOnline;
    this.isOnline = isOnline;
    if (isOnline && wasOffline) {
      // Exigence 6 - immediate flush attempt + accessible-ids re-check on
      // the reconnect transition, not just the next periodic tick.
      void this.pullAccessibleIdsAndReport();
      void this.reconnectAndFlush();
    }
  }

  /**
   * Category 12, feature 4 data-integrity review fix - the reconnect
   * transition previously fired `pullDeltaAndReport()` and `flush()`
   * concurrently (both `void`, neither awaited). `sendEntry`'s conflict
   * check (`resolveFieldLevelConflicts`, in `conflict.ts`) compares
   * against the LOCAL IndexedDB entity cache (`getEntity`), which only
   * `pullDelta` ever refreshes with another user's remote edits - it has
   * no freshness guarantee of its own relative to an in-flight `flush`.
   * Concretely: user A edits Issue X's priority while offline at t1; user
   * B edits the SAME field online at t2 (t2 > t1), a change A's client
   * never learns about while offline. A reconnects at t3. If `flush`'s
   * PATCH reaches the server before `pullDelta`'s (much larger, up-to-
   * 7-entity-types) GET response has been applied to the local cache,
   * `sendEntry` reads a stale pre-offline snapshot (`updated_at = t0 <
   * t1`), `conflict.ts`'s `serverUpdatedAt <= entry.baseUpdatedAt` guard
   * is satisfied on that stale read, NO conflict is detected, and A's
   * stale value silently clobbers B's genuinely newer edit - with no
   * toast, no sync-panel entry, nothing (the backend does no
   * server-side timestamp check of its own - see this feature's own
   * `updated_at`-based LWW design, not OCC). Awaiting the delta pull
   * before starting the flush narrows this window a lot for the exact
   * "just reconnected" transition this method exists for (and for cold
   * boot too, see `init()`) - it does NOT fully close it (a remote edit
   * could still land in the gap between the delta response and the
   * PATCH, or `pullDelta` could itself race a concurrent write) - a
   * fully airtight fix needs either a server-side conditional check or a
   * live per-entity freshness re-fetch immediately before each
   * conflict-checked PATCH, which is out of this pass's scope; see the
   * data-integrity review report for the full writeup.
   */
  private async reconnectAndFlush(): Promise<void> {
    await this.pullDeltaAndReport();
    void this.flush();
  }

  async retryEntry(id: string): Promise<void> {
    if (!this.db) return;
    await retryQueueEntry(this.db, id);
    await this.emitQueueSnapshot();
    void this.flush();
  }

  async retryAllFailed(): Promise<void> {
    if (!this.db) return;
    await retryAllFailedEntries(this.db);
    await this.emitQueueSnapshot();
    void this.flush();
  }

  /** Category 12, feature 4 data-integrity review fix - manual escape
   * hatch for a `failed` entry that can never succeed on retry (most
   * commonly: it targets an entity the user has since lost access to -
   * see `pullAccessibleIdsAndReport`'s own automatic version of this for
   * the common case, and this finding's own repro for why a manual
   * fallback is still worth having for everything else). Deliberately
   * unconditional on `status` - discarding a `pending`/`in_flight` entry
   * the user has simply decided to abandon is a legitimate use of the
   * same action, not just for `failed` ones. */
  async discardEntry(id: string): Promise<void> {
    if (!this.db) return;
    await deleteQueueEntry(this.db, id);
    postBroadcast(this.channel, { type: "queue-changed" });
    await this.emitQueueSnapshot();
  }

  /** On-demand equivalent of the periodic delta timer - exposed for a
   * manual "Refresh" trigger from the main thread. */
  async pullDeltaNow(): Promise<void> {
    await this.pullDeltaAndReport();
  }

  /** On-demand equivalent of the periodic accessible-ids timer. */
  async pullAccessibleIdsNow(): Promise<void> {
    await this.pullAccessibleIdsAndReport();
  }

  async touchProject(projectId: string): Promise<void> {
    if (!this.db) return;
    await touchProjectViewed(this.db, projectId);
    const protectedProjectIds = await this.protectedProjectIds();
    await evictLeastRecentlyViewedProjects(this.db, { protectedProjectIds });
  }

  private async protectedProjectIds(): Promise<Set<string>> {
    if (!this.db) return new Set();
    const entries = await listQueueEntries(this.db);
    const ids = entries
      .filter((entry) => entry.status !== "synced")
      .map((entry) => entry.route.projectId)
      .filter((id): id is string => Boolean(id));
    return new Set(ids);
  }

  private async handleBroadcast(message: TBroadcastMessage): Promise<void> {
    if (message.type === "queue-changed") {
      await this.emitQueueSnapshot();
      void this.flush();
    } else if (message.type === "id-remapped") {
      this.onMessage({
        type: "id-remapped",
        entityType: message.entityType as TMutableSyncEntity,
        oldId: message.oldId,
        newId: message.newId,
      });
    }
  }

  private async emitQueueSnapshot(): Promise<void> {
    if (!this.db) return;
    const entries = await listQueueEntries(this.db);
    this.onMessage({ type: "queue-snapshot", entries });
  }

  private async pullDeltaAndReport(): Promise<void> {
    if (!this.db || !this.config || !this.isOnline) return;
    try {
      const result = await pullDelta(this.db, this.config, ALL_ENTITIES);
      this.onMessage({ type: "delta-applied", entities: result.applied, deletedIds: result.deletedIds });
      postBroadcast(this.channel, { type: "delta-applied" });
    } catch (error) {
      this.onMessage({ type: "error", message: `delta pull failed: ${String(error)}` });
    }
  }

  private async pullAccessibleIdsAndReport(): Promise<void> {
    if (!this.db || !this.config || !this.isOnline) return;
    try {
      const purged = await pullAccessibleIds(this.db, this.config, ALL_ENTITIES);
      let discardedAnyMutation = false;
      for (const [entityType, removedIds] of Object.entries(purged)) {
        if (!removedIds || removedIds.length === 0) continue;
        this.onMessage({ type: "accessible-ids-purged", entityType: entityType as TSyncEntity, removedIds });
        // Category 12, feature 4 data-integrity review fix - a mutation
        // queued against one of these now-inaccessible entities can
        // never succeed (the next flush attempt would just get a 403
        // and land permanently `failed`, per exigence 4 - see this
        // finding's own repro): discard it here too, not just the
        // read-cache row `pullAccessibleIds` already purged above.
        // `db` is narrowed non-undefined by the outer guard; captured
        // into a local so the closure below doesn't need a repeated
        // non-null assertion.
        if (MUTABLE_ENTITY_PROCESSING_ORDER.includes(entityType as TMutableSyncEntity)) {
          const db = this.db;
          // eslint-disable-next-line no-await-in-loop -- bounded to at most 3 mutable entity types per poll, sequential is fine
          const discardedIds = await discardMutationsForInaccessibleEntities(
            db,
            entityType as TMutableSyncEntity,
            removedIds
          );
          if (discardedIds.length > 0) discardedAnyMutation = true;
        }
      }
      if (discardedAnyMutation) await this.emitQueueSnapshot();
    } catch (error) {
      this.onMessage({ type: "error", message: `accessible-ids pull failed: ${String(error)}` });
    }
  }

  async flush(): Promise<void> {
    if (!this.db || !this.config || !this.isOnline || this.flushInProgress) return;
    this.flushInProgress = true;
    const flushPromise = (async () => {
      try {
        await withFlushLock(this.config!.workspaceId, () => this.drainQueue());
      } finally {
        this.flushInProgress = false;
      }
    })();
    // Category 12, feature 4 data-integrity review fix - tracked so
    // `destroy(graceMs)` can wait for a flush that's already mid-`fetch`
    // to actually finish before this worker's `db`/`channel` are torn
    // down, instead of always abandoning it immediately - see
    // `destroy`'s own docstring.
    this.currentFlushPromise = flushPromise;
    try {
      await flushPromise;
    } finally {
      if (this.currentFlushPromise === flushPromise) this.currentFlushPromise = undefined;
    }
  }

  private async drainQueue(): Promise<void> {
    if (!this.db) return;
    // Both loops here are genuinely sequential by design, not just
    // lint-rule noise: entity TYPES are processed in a fixed order
    // (issue before issue_comment before page) so an issue created
    // earlier in this SAME flush pass has already resolved in `id_map`
    // by the time a dependent comment is attempted (see
    // `resolveEntryForSend`); and within one entity type, entries are
    // sent in FIFO (`createdAt`) order, awaited one at a time, so two
    // queued updates to the SAME entity reach the server in the order
    // the user actually made them.
    for (const entityType of MUTABLE_ENTITY_PROCESSING_ORDER) {
      // eslint-disable-next-line no-await-in-loop -- entity types must be drained in a fixed order, see comment above
      const sendable = await listSendableEntries(this.db, entityType);
      for (const entry of sendable) {
        // eslint-disable-next-line no-await-in-loop -- FIFO per entity, must send in order, see comment above
        await this.sendEntry(entry);
      }
    }
    await this.emitQueueSnapshot();
  }

  private async resolveEntryForSend(
    entry: TMutationQueueEntry
  ): Promise<{ blocked: true } | { blocked: false; entityId: string; issueId?: string }> {
    if (!this.db) return { blocked: true };
    let entityId = entry.entityId;
    let issueId = entry.route.issueId;

    if (entry.dependsOnClientId) {
      const resolved = await resolveClientId(this.db, entry.dependsOnClientId);
      if (!resolved) return { blocked: true };
      if (entityId === entry.dependsOnClientId) entityId = resolved;
      if (issueId === entry.dependsOnClientId) issueId = resolved;
    }

    return { blocked: false, entityId, issueId };
  }

  private async sendEntry(entry: TMutationQueueEntry): Promise<void> {
    if (!this.db || !this.config) return;

    const resolution = await this.resolveEntryForSend(entry);
    if (resolution.blocked) return; // still waiting on a dependency - revisit next flush tick

    let fieldsToSend = entry.payload;
    if (entry.operation === "update") {
      const snapshot = await getEntity(this.db, entry.entityType, resolution.entityId);
      const { fieldsToSend: resolvedFields, conflicts } = resolveFieldLevelConflicts(entry, snapshot);
      fieldsToSend = resolvedFields;
      await Promise.all(conflicts.map((conflict) => this.reportConflict(conflict)));
      if (Object.keys(fieldsToSend).length === 0) {
        // Every touched field lost its conflict check - nothing left to
        // send, the server's value already stands. Not an error.
        await deleteQueueEntry(this.db, entry.id);
        return;
      }
    }

    const request = buildRequest(
      { ...entry, payload: fieldsToSend },
      { entityId: resolution.entityId, issueId: resolution.issueId },
      this.config
    );

    await setStatus(this.db, entry.id, "in_flight");

    let response: Response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": entry.id },
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
    } catch (error) {
      // Network-level failure (no response at all) - transient, back off
      // and retry (exigence 4).
      await this.deferWithBackoff(entry, String(error));
      return;
    }

    if (response.ok) {
      await this.applySuccess(entry, request.method, resolution, response);
      return;
    }

    if (response.status >= 500) {
      // Transient server-side failure (self-hosted backend temporarily
      // unavailable, per this feature's own motivation) - back off and
      // retry, same as a network error.
      const body = await response.text().catch(() => "");
      await this.deferWithBackoff(entry, `HTTP ${response.status}: ${body.slice(0, 200)}`);
      return;
    }

    // A genuine 4xx - definitive validation failure. Exits the retry loop
    // immediately (exigence 4) and surfaces to the user (exigence 5's
    // "Syncing" panel shows `failed` entries with a manual Retry action).
    const body = await response.text().catch(() => "");
    await setStatus(this.db, entry.id, "failed", { lastError: `HTTP ${response.status}: ${body.slice(0, 500)}` });
  }

  private async deferWithBackoff(entry: TMutationQueueEntry, error: string): Promise<void> {
    if (!this.db) return;
    const retryCount = entry.retryCount + 1;
    await setStatus(this.db, entry.id, "pending", {
      retryCount,
      nextAttemptAt: Date.now() + computeBackoffMs(retryCount),
      lastError: error,
    });
  }

  private async applySuccess(
    entry: TMutationQueueEntry,
    method: string,
    resolution: { entityId: string; issueId?: string },
    response: Response
  ): Promise<void> {
    if (!this.db) return;

    if (method === "DELETE") {
      await deleteEntities(this.db, entry.entityType, [resolution.entityId]);
      await deleteQueueEntry(this.db, entry.id);
      postBroadcast(this.channel, { type: "queue-changed" });
      return;
    }

    const data: Record<string, unknown> = response.status === 204 ? {} : await response.json().catch(() => ({}));

    if (entry.operation === "create") {
      const serverId = typeof data.id === "string" ? data.id : resolution.entityId;
      await recordIdMapping(this.db, entry.entityType, entry.entityId, serverId);
      if (serverId !== entry.entityId) {
        await deleteEntities(this.db, entry.entityType, [entry.entityId]);
      }
      if (Object.keys(data).length > 0) await upsertEntities(this.db, entry.entityType, [data]);
      await deleteQueueEntry(this.db, entry.id);
      this.onMessage({ type: "id-remapped", entityType: entry.entityType, oldId: entry.entityId, newId: serverId });
      postBroadcast(this.channel, {
        type: "id-remapped",
        entityType: entry.entityType,
        oldId: entry.entityId,
        newId: serverId,
      });
      return;
    }

    // update
    if (Object.keys(data).length > 0) await upsertEntities(this.db, entry.entityType, [data]);
    await deleteQueueEntry(this.db, entry.id);
    postBroadcast(this.channel, { type: "queue-changed" });
  }

  private async reportConflict(conflict: Omit<TSyncConflict, "id" | "occurredAt">): Promise<void> {
    const full: TSyncConflict = { ...conflict, id: crypto.randomUUID(), occurredAt: new Date().toISOString() };
    this.onMessage({ type: "conflict", conflict: full });
    postBroadcast(this.channel, {
      type: "conflict",
      entityType: full.entityType,
      entityId: full.entityId,
      field: full.field,
    });
  }
}
