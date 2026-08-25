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
