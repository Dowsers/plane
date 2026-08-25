/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { deleteEntities, purgeInaccessible, upsertEntities } from "./cache";
import type { TPlaneOfflineSyncDB } from "./db";
import type { TCachedEntity, TMutableSyncEntity, TSyncEngineInitConfig, TSyncEntity } from "./types";

/**
 * Category 12, feature 4 - the client side of the backend's `GET
 * .../sync/` (delta) and `GET .../sync/accessible-ids/` (access-
 * revocation reconciliation) endpoints, see this feature's own backend
 * report for the full contract this replays against.
 */

const CURSOR_META_KEY = "delta-sync:cursor";
const ACCESSIBLE_IDS_POLLED_AT_META_KEY = "accessible-ids:last-polled-at";

const REFERENCE_ENTITIES: ReadonlySet<TSyncEntity> = new Set(["cycle", "module", "label", "state"]);
const DELTA_CAPABLE_ENTITIES: ReadonlySet<TMutableSyncEntity> = new Set(["issue", "issue_comment", "page"]);

/**
 * Safety valve for a discrepancy found while implementing this against
 * the actual (already-shipped, already-tested) backend query: the
 * documented paging contract ("call again with the EXACT SAME `since`
 * until `has_more` is false") is only genuinely advance-able if each
 * repeat call can return a DIFFERENT page - but `_delta_bucket`
 * (`plane.utils.offline_sync`) pages with a plain `updated_at__gt=since`
 * filter plus a LIMIT and no offset/keyset, so re-issuing the identical
 * request returns the identical first `DELTA_PAGE_SIZE` (1000) rows
 * every time. In the overwhelmingly common case (fewer than 1000 rows
 * changed since the last poll) this never matters - `has_more` is false
 * on the very first response. It only bites a workspace whose FIRST
 * full sync (no `since` yet) covers more than 1000 issues/comments/
 * pages, where naively following the documented contract verbatim would
 * spin forever re-fetching the same page. Rather than rewriting the
 * backend's already-shipped pagination algorithm from this frontend-
 * scoped task (a real fix needs a keyset/opaque per-page cursor, which
 * is a bigger, independently-reviewable change), this client bounds how
 * many times it will repeat an identical-`since` request per entity
 * before giving up on that entity for THIS poll and trying again on the
 * next one - never hangs the worker, and is a purely defensive client-
 * side mitigation, not a workaround that masks the gap: `pullDelta`'s
 * return value reports which entities hit this ceiling so the caller can
 * surface it. See `README.md`'s "Known backend limitation" section.
 */
const MAX_SAME_SINCE_PAGES = 5;

export interface TDeltaApiResponse {
  cursor: string;
  [entity: string]: unknown;
}

export interface TDeltaBucket {
  results: Record<string, unknown>[];
  has_more?: boolean;
  deleted_ids?: string[];
}

export interface TPullDeltaResult {
  applied: Partial<Record<TSyncEntity, TCachedEntity[]>>;
  deletedIds: Partial<Record<TMutableSyncEntity, string[]>>;
  /** Entities that hit `MAX_SAME_SINCE_PAGES` this poll without reporting
   * `has_more: false` - see that constant's own docstring. */
  incompleteEntities: TSyncEntity[];
}

async function fetchJson(url: string): Promise<TDeltaApiResponse> {
  const response = await fetch(url, { method: "GET", credentials: "include" });
  if (!response.ok) throw new Error(`sync-engine: delta/accessible-ids request failed (${response.status})`);
  return response.json();
}

export async function getCursor(db: TPlaneOfflineSyncDB): Promise<string | undefined> {
  const entry = await db.get("meta", CURSOR_META_KEY);
  return entry?.value;
}

async function setCursor(db: TPlaneOfflineSyncDB, cursor: string): Promise<void> {
  await db.put("meta", { key: CURSOR_META_KEY, value: cursor });
}

/** Full-snapshot reference entities (`cycle`/`module`/`label`/`state`) -
 * the response is always the COMPLETE currently-visible set, so the
 * correct client behavior is to make the cache match it exactly: upsert
 * everything present, and drop any cached row that's no longer in the
 * new snapshot (this is what naturally handles both real deletions and
 * access changes for these entities - see the backend's own
 * `build_delta_response` docstring). */
async function applyReferenceSnapshot(
  db: TPlaneOfflineSyncDB,
  entityType: TSyncEntity,
  records: Record<string, unknown>[]
): Promise<void> {
  await upsertEntities(db, entityType, records);
  await purgeInaccessible(
    db,
    entityType,
    records.map((record) => record.id as string)
  );
}

export async function pullDelta(
  db: TPlaneOfflineSyncDB,
  config: TSyncEngineInitConfig,
  entities: TSyncEntity[]
): Promise<TPullDeltaResult> {
  const applied: Partial<Record<TSyncEntity, TCachedEntity[]>> = {};
  const deletedIds: Partial<Record<TMutableSyncEntity, string[]>> = {};
  const incompleteEntities: TSyncEntity[] = [];

  const since = await getCursor(db);
  const entitiesParam = entities.join(",");
  let latestCursor = since;
  const pending = new Set(entities.filter((entity) => DELTA_CAPABLE_ENTITIES.has(entity as TMutableSyncEntity)));

  // Genuinely sequential - each page's request/response must complete
  // before deciding (via `pending`) whether another page is needed, per
  // the backend's own "repeat while has_more" contract (see
  // `MAX_SAME_SINCE_PAGES`'s docstring for the bounded-retry safety
  // valve this loop also enforces).
  for (let page = 0; page < MAX_SAME_SINCE_PAGES && pending.size > 0; page++) {
    const url = `${config.apiBaseUrl}/api/workspaces/${config.workspaceSlug}/sync/?entities=${entitiesParam}${
      since ? `&since=${encodeURIComponent(since)}` : ""
    }`;
    // eslint-disable-next-line no-await-in-loop -- next page's need depends on this response, see comment above
    const response = await fetchJson(url);
    latestCursor = response.cursor;

    // Independent per entity within a single page response - safe to
    // apply in parallel.
    // eslint-disable-next-line no-await-in-loop -- the loop above is the sequential part; this itself is the (already parallel) per-page work
    await Promise.all(
      entities.map(async (entity) => {
        const bucket = response[entity] as TDeltaBucket | undefined;
        if (!bucket) return;

        if (REFERENCE_ENTITIES.has(entity)) {
          await applyReferenceSnapshot(db, entity, bucket.results);
          applied[entity] = bucket.results as TCachedEntity[];
          return;
        }

        const mutableEntity = entity as TMutableSyncEntity;
        const tasks: Promise<unknown>[] = [upsertEntities(db, entity, bucket.results)];
        applied[entity] = [...(applied[entity] ?? []), ...(bucket.results as TCachedEntity[])];

        if (bucket.deleted_ids && bucket.deleted_ids.length > 0) {
          tasks.push(deleteEntities(db, entity, bucket.deleted_ids));
          deletedIds[mutableEntity] = [...(deletedIds[mutableEntity] ?? []), ...bucket.deleted_ids];
        }
        await Promise.all(tasks);

        if (bucket.has_more) {
          pending.add(entity);
        } else {
          pending.delete(entity);
        }
      })
    );

    if (page === MAX_SAME_SINCE_PAGES - 1 && pending.size > 0) {
      incompleteEntities.push(...pending);
      pending.clear();
    }
  }

  await setCursor(db, latestCursor ?? new Date().toISOString());
  return { applied, deletedIds, incompleteEntities };
}

export async function pullAccessibleIds(
  db: TPlaneOfflineSyncDB,
  config: TSyncEngineInitConfig,
  entities: TSyncEntity[]
): Promise<Partial<Record<TSyncEntity, string[]>>> {
  const entitiesParam = entities.join(",");
  const url = `${config.apiBaseUrl}/api/workspaces/${config.workspaceSlug}/sync/accessible-ids/?entities=${entitiesParam}`;
  const response = await fetchJson(url);

  const purged: Partial<Record<TSyncEntity, string[]>> = {};
  await Promise.all(
    entities.map(async (entity) => {
      const ids = response[entity] as string[] | undefined;
      if (!ids) return;
      purged[entity] = await purgeInaccessible(db, entity, ids);
    })
  );
  await db.put("meta", { key: ACCESSIBLE_IDS_POLLED_AT_META_KEY, value: new Date().toISOString() });
  return purged;
}

export async function getLastAccessibleIdsPollAt(db: TPlaneOfflineSyncDB): Promise<string | undefined> {
  const entry = await db.get("meta", ACCESSIBLE_IDS_POLLED_AT_META_KEY);
  return entry?.value;
}
