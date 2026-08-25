/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ALL_ENTITY_STORE_NAMES } from "./db";
import type { TPlaneOfflineSyncDB } from "./db";
import type { TCachedEntity, TSyncEntity } from "./types";

/**
 * Category 12, feature 4 - the read-through entity cache (exigence 7 -
 * "les vues deja chargees restent consultables... depuis le cache
 * IndexedDB") plus the LRU quota-eviction policy (exigence 13).
 */

/**
 * Self-imposed soft cap on the estimated cache size PER WORKSPACE
 * (metadata-only entity records - no attachments/binaries, exigence's
 * own "Hors perimetre" already excludes those; Page rich-text bodies
 * live entirely in the separate, pre-existing y-indexeddb store this
 * feature deliberately doesn't touch, see `README.md`). 30 MB is
 * generous for pure-JSON issue/comment/page-metadata/reference records
 * (a back-of-envelope ~1-2 KB per issue record means this comfortably
 * holds tens of thousands of issues) while still being small enough that
 * proactively evicting at this line, before ever hitting a real
 * `QuotaExceededError` or the browser's own origin-wide storage pressure
 * eviction (which the browser could trigger on ANY of this origin's
 * IndexedDB data, not just ours, and with no control over WHICH records
 * it drops), stays a predictable, self-controlled policy rather than a
 * reactive one. Exported so a later tuning pass can override it without
 * hunting through the eviction logic itself.
 */
export const DEFAULT_QUOTA_BYTES = 30 * 1024 * 1024;

const ENTITY_STORE_ENTRIES = Object.entries(ALL_ENTITY_STORE_NAMES) as [TSyncEntity, string][];

function stampRecord(entityType: TSyncEntity, record: Record<string, unknown>): TCachedEntity {
  const id = record.id;
  if (typeof id !== "string") {
    throw new Error(`sync-engine: cannot cache a ${entityType} record without a string "id" field`);
  }
  const projectId = typeof record.project_id === "string" ? record.project_id : undefined;
  return { ...record, id, _cachedAt: Date.now(), _projectId: projectId } as TCachedEntity;
}

/** Write-through into the cache - called by the delta-sync pull loop for
 * every entity type, and by the mutation-queue flush loop with a
 * mutation's own success response (so the cache reflects a just-synced
 * write immediately, without waiting for the next delta poll). */
export async function upsertEntities(
  db: TPlaneOfflineSyncDB,
  entityType: TSyncEntity,
  records: Record<string, unknown>[]
): Promise<void> {
  if (records.length === 0) return;
  const storeName = ALL_ENTITY_STORE_NAMES[entityType];
  const tx = db.transaction(storeName, "readwrite");
  await Promise.all(records.map((record) => tx.store.put(stampRecord(entityType, record))));
  await tx.done;
}

export async function getEntity(
  db: TPlaneOfflineSyncDB,
  entityType: TSyncEntity,
  id: string
): Promise<TCachedEntity | undefined> {
  const storeName = ALL_ENTITY_STORE_NAMES[entityType];
  return db.get(storeName, id);
}

export async function listEntitiesByProject(
  db: TPlaneOfflineSyncDB,
  entityType: TSyncEntity,
  projectId: string
): Promise<TCachedEntity[]> {
  const storeName = ALL_ENTITY_STORE_NAMES[entityType];
  return db.getAllFromIndex(storeName, "by-project", projectId);
}

export async function listAllEntities(db: TPlaneOfflineSyncDB, entityType: TSyncEntity): Promise<TCachedEntity[]> {
  const storeName = ALL_ENTITY_STORE_NAMES[entityType];
  return db.getAll(storeName);
}

export async function deleteEntities(db: TPlaneOfflineSyncDB, entityType: TSyncEntity, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const storeName = ALL_ENTITY_STORE_NAMES[entityType];
  const tx = db.transaction(storeName, "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

/** Exigence 8/11 - diff the FULL accessible id set the server just
 * reported against what's cached locally, and drop anything cached but
 * no longer present (covers both real deletions the client missed and
 * genuine access revocations - either way "no longer present" is the
 * correct purge signal, see the backend's own
 * `WorkspaceSyncAccessibleIdsEndpoint` docstring). Returns the ids that
 * were actually purged, for the caller to relay to the main thread (so
 * MobX stores can drop them too, not just IndexedDB). */
export async function purgeInaccessible(
  db: TPlaneOfflineSyncDB,
  entityType: TSyncEntity,
  accessibleIds: string[]
): Promise<string[]> {
  const cached = await listAllEntities(db, entityType);
  const accessible = new Set(accessibleIds);
  const toRemove = cached.filter((record) => !accessible.has(record.id)).map((record) => record.id);
  await deleteEntities(db, entityType, toRemove);
  return toRemove;
}

export async function touchProjectViewed(db: TPlaneOfflineSyncDB, projectId: string): Promise<void> {
  await db.put("project_lru", { projectId, lastViewedAt: Date.now() });
}

/** Rough, cheap-enough size estimate - `JSON.stringify` length (UTF-16
 * code units, so *2 approximates bytes) summed across every mutable +
 * reference entity store. Not byte-exact (IndexedDB's own on-disk
 * encoding overhead isn't modeled) but well within the margin needed for
 * a soft, proactive eviction trigger rather than a hard accounting
 * requirement. */
export async function estimateWorkspaceCacheBytes(db: TPlaneOfflineSyncDB): Promise<number> {
  const perStoreSizes = await Promise.all(
    ENTITY_STORE_ENTRIES.map(async ([entityType]) => {
      const records = await listAllEntities(db, entityType);
      return records.reduce((sum, record) => sum + JSON.stringify(record).length * 2, 0);
    })
  );
  return perStoreSizes.reduce((sum, size) => sum + size, 0);
}

/**
 * Exigence 13 - once the estimated cache size exceeds `quotaBytes`,
 * evict the least-recently-VIEWED project's cached entity data first
 * (tracked in `project_lru`, bumped by `touchProjectViewed` whenever a
 * project-scoped view is opened - NOT bumped by a background delta pull,
 * so this is genuinely "recently viewed", not "recently synced").
 * Repeats, oldest project first, until back under quota or there is
 * nothing left safe to evict.
 *
 * NEVER evicts `mutation_queue` (that store isn't touched by this
 * function at all - it lives in a completely separate set of object
 * stores from the entity caches this walks). Also never evicts a
 * project that currently has any non-synced `mutation_queue` entry
 * routed to it (passed in as `protectedProjectIds`) - evicting a
 * project's cached parent-issue/label/state data out from under a still-
 * pending offline mutation that may need to read it (e.g. to resolve a
 * comment's parent issue, or to render the optimistic UI) would be an
 * own-goal: it can't lose the mutation itself, but it could lose context
 * needed to display or reconcile it correctly.
 */
export async function evictLeastRecentlyViewedProjects(
  db: TPlaneOfflineSyncDB,
  options: { quotaBytes?: number; protectedProjectIds: Set<string> }
): Promise<string[]> {
  const quotaBytes = options.quotaBytes ?? DEFAULT_QUOTA_BYTES;
  const evicted: string[] = [];

  // Genuinely sequential by construction - each iteration must re-measure
  // the cache size AFTER the previous iteration's eviction to decide
  // whether to keep going, so this cannot be parallelized across
  // iterations (only the per-STORE work within one iteration below is).
  for (let iterations = 0; iterations < 100; iterations++) {
    // eslint-disable-next-line no-await-in-loop -- next iteration's decision depends on this measurement, see comment above
    const currentBytes = await estimateWorkspaceCacheBytes(db);
    if (currentBytes <= quotaBytes) break;

    // eslint-disable-next-line no-await-in-loop -- depends on evictions applied by prior iterations
    const candidates = await db.getAllFromIndex("project_lru", "by-last-viewed");
    const nextCandidate = candidates.find((candidate) => !options.protectedProjectIds.has(candidate.projectId));
    if (!nextCandidate) break; // nothing left that's safe to evict

    // eslint-disable-next-line no-await-in-loop -- one eviction step must fully land before the next iteration re-measures
    await Promise.all(
      ENTITY_STORE_ENTRIES.map(async ([entityType]) => {
        const records = await listEntitiesByProject(db, entityType, nextCandidate.projectId);
        await deleteEntities(
          db,
          entityType,
          records.map((record) => record.id)
        );
      })
    );
    // eslint-disable-next-line no-await-in-loop -- part of the same eviction step as above
    await db.delete("project_lru", nextCandidate.projectId);
    evicted.push(nextCandidate.projectId);
  }

  return evicted;
}
