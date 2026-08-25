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
  listQueueEntries,
  listSendableEntries,
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

  constructor(private readonly onMessage: (message: TWorkerToMainMessage) => void) {}

  async init(config: TSyncEngineInitConfig): Promise<void> {
    this.config = config;
    this.db = await openWorkspaceDb(config.workspaceId);
    this.channel = openBroadcastChannel(config.workspaceId);
    this.channel?.addEventListener("message", (event: MessageEvent<TBroadcastMessage>) => {
      void this.handleBroadcast(event.data);
    });

    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.deltaTimer = setInterval(() => void this.pullDeltaAndReport(), DELTA_POLL_INTERVAL_MS);
    this.accessibleIdsTimer = setInterval(
      () => void this.pullAccessibleIdsAndReport(),
      ACCESSIBLE_IDS_POLL_INTERVAL_MS
    );

    this.onMessage({ type: "ready" });
    await this.emitQueueSnapshot();
    void this.pullDeltaAndReport();
    void this.pullAccessibleIdsAndReport();
    void this.flush();
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.deltaTimer) clearInterval(this.deltaTimer);
    if (this.accessibleIdsTimer) clearInterval(this.accessibleIdsTimer);
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
      void this.pullDeltaAndReport();
      void this.pullAccessibleIdsAndReport();
      void this.flush();
    }
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
      for (const [entityType, removedIds] of Object.entries(purged)) {
        if (removedIds && removedIds.length > 0) {
          this.onMessage({ type: "accessible-ids-purged", entityType: entityType as TSyncEntity, removedIds });
        }
      }
    } catch (error) {
      this.onMessage({ type: "error", message: `accessible-ids pull failed: ${String(error)}` });
    }
  }

  async flush(): Promise<void> {
    if (!this.db || !this.config || !this.isOnline || this.flushInProgress) return;
    this.flushInProgress = true;
    try {
      await withFlushLock(this.config.workspaceId, () => this.drainQueue());
    } finally {
      this.flushInProgress = false;
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
