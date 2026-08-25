/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPlaneOfflineSyncDB } from "./db";
import type { TMutableSyncEntity, TMutationQueueEntry, TMutationStatus } from "./types";

/**
 * Category 12, feature 4 - `mutation_queue` reads/writes (exigence 2).
 * Every function here is a thin, direct IndexedDB operation - the actual
 * FIFO-per-entity + dependency-ordering + backoff *policy* lives in
 * `core.ts` (`SyncEngineCore.flush`), not here; this module only knows
 * how to store and retrieve entries.
 */

export const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 1_000;

/** 1s, 2s, 4s, 8s... capped at `MAX_BACKOFF_MS` (exigence 4). */
export function computeBackoffMs(retryCount: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** retryCount);
}

export async function enqueueMutation(db: TPlaneOfflineSyncDB, entry: TMutationQueueEntry): Promise<void> {
  await db.put("mutation_queue", entry);
}

export async function getQueueEntry(db: TPlaneOfflineSyncDB, id: string): Promise<TMutationQueueEntry | undefined> {
  return db.get("mutation_queue", id);
}

export async function listQueueEntries(db: TPlaneOfflineSyncDB): Promise<TMutationQueueEntry[]> {
  const all = await db.getAll("mutation_queue");
  return all.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Every entry that hasn't reached a terminal `synced` state - the exact
 * count the "Syncing (n)" indicator (exigence 5) and the `beforeunload`
 * guard (exigence 14) both key off of. */
export async function listNonSyncedEntries(db: TPlaneOfflineSyncDB): Promise<TMutationQueueEntry[]> {
  const all = await listQueueEntries(db);
  return all.filter((entry) => entry.status !== "synced");
}

export async function updateQueueEntry(
  db: TPlaneOfflineSyncDB,
  id: string,
  patch: Partial<TMutationQueueEntry>
): Promise<TMutationQueueEntry | undefined> {
  const tx = db.transaction("mutation_queue", "readwrite");
  const existing = await tx.store.get(id);
  if (!existing) {
    await tx.done;
    return undefined;
  }
  const updated: TMutationQueueEntry = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await tx.store.put(updated);
  await tx.done;
  return updated;
}

/** Only ever called once an entry is durably `synced` server-side - a
 * `mutation_queue` row's whole purpose is tracking NON-synced work, so
 * there's nothing worth keeping once it's confirmed. Never called by the
 * LRU quota-eviction path (see `cache.ts`'s docstring - unsynced entries
 * are never evicted for space, only deleted here on genuine success). */
export async function deleteQueueEntry(db: TPlaneOfflineSyncDB, id: string): Promise<void> {
  await db.delete("mutation_queue", id);
}

export async function setStatus(
  db: TPlaneOfflineSyncDB,
  id: string,
  status: TMutationStatus,
  extra?: Partial<TMutationQueueEntry>
): Promise<TMutationQueueEntry | undefined> {
  return updateQueueEntry(db, id, { status, ...extra });
}

/** Re-arms a `failed` entry for another attempt - the manual "Retry"
 * action (exigence 5's own "bouton Reessayer par item en echec"). Resets
 * `retryCount`/backoff so the very next flush pass tries it immediately
 * rather than waiting out whatever backoff it had accumulated before it
 * was marked `failed` (a 4xx never actually backs off - see `core.ts` -
 * but this keeps the reset correct even if that ever changes). */
export async function retryEntry(db: TPlaneOfflineSyncDB, id: string): Promise<TMutationQueueEntry | undefined> {
  return updateQueueEntry(db, id, { status: "pending", retryCount: 0, nextAttemptAt: 0, lastError: undefined });
}

export async function retryAllFailed(db: TPlaneOfflineSyncDB): Promise<void> {
  const all = await db.getAllFromIndex("mutation_queue", "by-status", "failed");
  await Promise.all(all.map((entry) => retryEntry(db, entry.id)));
}

/**
 * Category 12, feature 4 data-integrity review fix - drops any queued,
 * NOT-yet-synced mutation that targets an entity the accessible-ids
 * reconciliation (`delta.ts`'s `pullAccessibleIds`) just discovered the
 * user can no longer see, so it doesn't sit `failed` forever after the
 * inevitable 403 the very next flush attempt would get (see this
 * finding's own repro: a mutation queued against an entity in project P
 * right before the user is removed from P). Only ever matches on
 * `entityId` for the SAME `entityType` as a server-reported removed id -
 * a `create` entry's `entityId` is still a purely local, client-
 * generated id the server has never heard of, so it can never appear in
 * a server-reported removed-ids list and is safely left alone (correct:
 * a create genuinely doesn't need this, there's nothing server-side yet
 * to have lost access to).
 */
export async function discardMutationsForInaccessibleEntities(
  db: TPlaneOfflineSyncDB,
  entityType: TMutableSyncEntity,
  removedIds: string[]
): Promise<string[]> {
  if (removedIds.length === 0) return [];
  const removed = new Set(removedIds);
  const all = await listQueueEntries(db);
  const toDiscard = all.filter(
    (entry) => entry.entityType === entityType && entry.status !== "synced" && removed.has(entry.entityId)
  );
  await Promise.all(toDiscard.map((entry) => deleteQueueEntry(db, entry.id)));
  return toDiscard.map((entry) => entry.id);
}

/**
 * Category 12, feature 4 data-integrity review fix - heals any entry
 * left stuck at `in_flight` from a PREVIOUS worker lifetime (a tab
 * crash, or `leaveWorkspace()`'s `worker.terminate()` killing a flush
 * mid-`fetch`, per the review's own repro - see `core.ts`'s `init()` for
 * the call site and the full reasoning). `in_flight` is invisible to
 * `listSendableEntries` (it only ever selects `pending`), so without
 * this an entry stranded here is never automatically retried, and the
 * "Syncing" panel's manual Retry button only renders for `failed` - a
 * stuck `in_flight` entry had no recovery path at all, for any tab,
 * forever.
 *
 * Safe to call unconditionally on every `init()`: this runs BEFORE the
 * new worker instance attempts any flush of its own, and every request
 * this queue ever sends carries `Idempotency-Key: entry.id` (see
 * `core.ts`'s `sendEntry`), so even in the (rare) case the original
 * request actually reached the server and the worker was killed only
 * before it could record that locally, resending it is safe - the
 * server-side replay protection (`plane.utils.idempotency`) returns the
 * original response rather than repeating the mutation.
 */
export async function resetStrandedInFlightEntries(db: TPlaneOfflineSyncDB): Promise<number> {
  const stuck = await db.getAllFromIndex("mutation_queue", "by-status", "in_flight");
  await Promise.all(stuck.map((entry) => setStatus(db, entry.id, "pending", { nextAttemptAt: 0 })));
  return stuck.length;
}

/** The next entry (in FIFO/`createdAt` order) for a given entity type
 * that is actually eligible to be sent right now: `pending` (not
 * `failed`, not already `in_flight`, not `synced`) and past its backoff
 * window. Does NOT skip over an entry with an unresolved dependency -
 * `core.ts` checks that separately (via `id_map`) so it can correctly
 * decide "wait for this one" vs "this one's dependency resolved, but a
 * LATER one in FIFO order for the same entity is still blocked" without
 * silently reordering past a genuinely blocked head-of-queue entry. */
export async function listSendableEntries(
  db: TPlaneOfflineSyncDB,
  entityType: TMutableSyncEntity
): Promise<TMutationQueueEntry[]> {
  const now = Date.now();
  const entries = await db.getAllFromIndex("mutation_queue", "by-entity-type-status", [entityType, "pending"]);
  return entries
    .filter((entry) => entry.nextAttemptAt <= now)
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
}
