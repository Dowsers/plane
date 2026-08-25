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
 * Shared types for the whole package - the IndexedDB schema, the
 * mutation-queue entry shape, and the worker<->main-thread message
 * protocol. Kept in one file since almost every other module in this
 * package needs most of these.
 */

/** The 3 entity types this feature actually queues OFFLINE MUTATIONS for
 * (exigence 1's own wording: Cycle/Module/Label/State are read-only
 * reference data in this feature's scope - only an Issue's *assignment*
 * to one of them is a mutation, never the reference entity itself). */
export type TMutableSyncEntity = "issue" | "issue_comment" | "page";

/** The full set of entity types the delta-sync/accessible-ids endpoints
 * (`GET .../sync/`, `GET .../sync/accessible-ids/`) can return - adds the
 * 4 read-only reference entities on top of `TMutableSyncEntity`. */
export type TSyncEntity = TMutableSyncEntity | "cycle" | "module" | "label" | "state";

export type TMutationOperation = "create" | "update" | "delete";

export type TMutationStatus = "pending" | "in_flight" | "failed" | "synced";

/**
 * One row of the `mutation_queue` IndexedDB store (exigence 2). `id` is
 * both the client-generated uuid AND the `Idempotency-Key` sent with the
 * HTTP request replaying this mutation - reusing one uuid for both means
 * the backend's replay-safety (see `plane.utils.idempotency` on the
 * apiserver) and this queue's own identity are always the same value,
 * never two ids to keep in sync.
 *
 * `entityId` starts out as the CLIENT-generated id for a `create`
 * mutation (there is no server id yet) and is a real server id for
 * `update`/`delete` mutations (the entity already existed). Once a
 * `create` mutation is actually flushed and the server assigns a real
 * id, `entityId` on THIS entry is rewritten to the real id (see
 * `id-map.ts`) - but any OTHER already-queued entry that referenced the
 * client id (e.g. a queued comment's `payload.issue_id`) is deliberately
 * NOT rewritten eagerly; it is resolved lazily at send-time via the
 * `id_map` store instead (see `id-map.ts`'s own docstring for why).
 */
export interface TMutationQueueEntry {
  id: string;
  workspaceId: string;
  entityType: TMutableSyncEntity;
  entityId: string;
  operation: TMutationOperation;
  /** The fields being created/updated, exactly as they'll be sent in the
   * HTTP request body (after id-map resolution at send-time). For
   * `update`, only the fields the user actually touched - never a full
   * snapshot - so an untouched field can never be clobbered by a stale
   * replay. */
  payload: Record<string, unknown>;
  /** Extra routing info this entry's HTTP request needs beyond
   * `entityId`/`payload` - which project (Issue/IssueComment always need
   * one), and for a comment, its parent issue id (itself possibly still
   * a client id pending resolution via `id_map`). */
  route: {
    projectId?: string;
    /** Only set for `issue_comment` mutations. */
    issueId?: string;
  };
  /** The client-generated id of a `create` mutation this entry depends
   * on (e.g. a comment queued against an issue that itself hasn't been
   * assigned a real server id yet, or an update queued against an
   * entity created earlier in the same offline session) - by
   * convention (see `enqueue.ts`) a `create` mutation's own queue-entry
   * `id` IS its optimistic `entityId`, so this is directly usable as an
   * `id_map` lookup key. `undefined` if this entry has no unresolved
   * dependency. Whichever of `entityId`/`route.issueId` currently equals
   * this value is substituted with the resolved server id at send time
   * (see `core.ts`'s `resolveEntryForSend`) - never rewritten in place
   * here, so this field stays a stable, replay-safe description of the
   * dependency regardless of how many flush attempts it takes to
   * resolve. */
  dependsOnClientId?: string;
  /** The entity's `updated_at` the client believed to be current AT THE
   * MOMENT this mutation was created (from the cached entity record) -
   * the baseline exigence 8's last-write-wins comparison is made
   * against. `undefined` for `create` (nothing to compare against) and
   * for a locally-optimistic entity that was itself never
   * server-confirmed yet. */
  baseUpdatedAt?: string;
  /** For each field touched in `payload`, the value that field held in
   * the cached record immediately BEFORE this offline edit - the
   * per-field conflict baseline `conflict.ts`'s `resolveFieldLevelConflicts`
   * compares the server's current value against (see that module's own
   * docstring for the full 2-step rule). Only ever set for `update`
   * mutations with a known `baseUpdatedAt` - a `create` has nothing to
   * conflict with. */
  baseFieldValues?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  status: TMutationStatus;
  /** Epoch ms - the flush loop skips this entry until `Date.now() >=
   * nextAttemptAt` (exponential backoff, exigence 4). */
  nextAttemptAt: number;
  lastError?: string;
}

/** A cached entity record - the raw fields returned by the delta-sync
 * endpoint (or a mutation's own response), plus bookkeeping the cache
 * itself needs. Stored per entity type in its own object store. */
export type TCachedEntity = Record<string, unknown> & {
  id: string;
  /** Bumped on every write-through - used by the LRU quota eviction to
   * tell "recently written" apart from "recently viewed" (the latter is
   * tracked per-PROJECT in the `project_lru` store instead, see
   * exigence 13's own "least-recently-viewed PROJECT" wording). */
  _cachedAt: number;
  /** Best-effort project scoping for LRU eviction bucketing - `undefined`
   * for `page` records that are workspace-global (`is_global: true`),
   * which are never evicted by the per-project LRU pass. */
  _projectId?: string;
};

export interface TIdMapEntry {
  /** The client-generated id of a `create` mutation (also its queue
   * entry's own `id`/Idempotency-Key). */
  clientId: string;
  entityType: TMutableSyncEntity;
  /** The real server-assigned id, once known. Absent while the create is
   * still queued/in-flight - callers use `id_map.get(clientId) ===
   * undefined` to mean "still unresolved, keep deferring". */
  serverId: string;
}

export interface TProjectLruEntry {
  projectId: string;
  lastViewedAt: number;
}

/** One row of the `meta` store - a flat key/value bag for the delta-sync
 * cursor and the last accessible-ids poll timestamp. */
export interface TMetaEntry {
  key: string;
  value: string;
}

/** A conflict surfaced by exigence 9 - a field-level LWW resolution that
 * discarded a real local change. */
export interface TSyncConflict {
  id: string;
  entityType: TMutableSyncEntity;
  entityId: string;
  field: string;
  discardedLocalValue: unknown;
  serverValue: unknown;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Worker <-> main-thread message protocol
// ---------------------------------------------------------------------------

export interface TSyncEngineInitConfig {
  workspaceId: string;
  workspaceSlug: string;
  /** The bare API origin - matches `API_BASE_URL` from `@plane/constants`
   * (e.g. `super(API_BASE_URL)` in every existing `packages/services`
   * class). Every path is rooted at `/api/...` on top of this, never
   * baked into the base itself - see `request.ts`'s `workspaceBase`. */
  apiBaseUrl: string;
}

export type TMainToWorkerMessage =
  | { type: "init"; config: TSyncEngineInitConfig }
  | { type: "enqueue"; entry: TMutationQueueEntry }
  | { type: "network-status"; isOnline: boolean }
  | { type: "flush-now" }
  | { type: "retry-entry"; id: string }
  | { type: "retry-all-failed" }
  | { type: "pull-delta-now" }
  | { type: "pull-accessible-ids-now" }
  | { type: "touch-project"; projectId: string }
  | { type: "destroy" };

export type TWorkerToMainMessage =
  | { type: "ready" }
  | { type: "queue-snapshot"; entries: TMutationQueueEntry[] }
  | { type: "id-remapped"; entityType: TMutableSyncEntity; oldId: string; newId: string }
  | { type: "conflict"; conflict: TSyncConflict }
  | {
      type: "delta-applied";
      entities: Partial<Record<TSyncEntity, TCachedEntity[]>>;
      deletedIds: Partial<Record<TMutableSyncEntity, string[]>>;
    }
  | { type: "accessible-ids-purged"; entityType: TSyncEntity; removedIds: string[] }
  | { type: "error"; message: string };

/** Bus name for cross-tab coordination (leader election notifications +
 * queue-changed signals) - exigence 12. One channel per workspace so two
 * different workspaces open in different tabs never cross signals. */
export function broadcastChannelName(workspaceId: string): string {
  return `plane-offline-sync:${workspaceId}`;
}

/** Web Locks API resource name used to ensure only one tab's worker
 * actually flushes the queue at a time (exigence 12). */
export function flushLockName(workspaceId: string): string {
  return `plane-offline-sync:flush:${workspaceId}`;
}
