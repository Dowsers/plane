/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPlaneOfflineSyncDB } from "./db";
import type { TMutableSyncEntity } from "./types";

/**
 * Category 12, feature 4 - client-id <-> server-id reconciliation
 * (exigence 3's "une issue doit etre creee cote serveur avant qu'un
 * commentaire lie ne soit envoye").
 *
 * Design: when an Issue is created OFFLINE, its `mutation_queue` entry
 * (and the optimistic cache/UI record) use a client-generated uuid as
 * `entityId` - there is no server id yet. A comment queued against that
 * same not-yet-synced issue can only know that same client uuid as its
 * `route.issueId`.
 *
 * Rather than eagerly rewriting every already-queued entry's stored
 * `payload`/`route` fields the moment the issue's create mutation
 * succeeds (which would mean walking the entire queue on every single
 * create success, and would still miss anything enqueued in the tiny
 * window between "server responded" and "rewrite pass ran"), this store
 * is the single source of truth for "has this client id been resolved to
 * a real server id yet", consulted LAZILY, at send-time, by
 * `core.ts`'s flush loop: right before building the HTTP request for any
 * queue entry, every id-shaped field it holds (its own `entityId` if the
 * entry is itself an `update`/`delete` on a client id, or a FK field
 * inside `payload`/`route` such as `issue_id`) is resolved through this
 * map. An entry whose dependency isn't resolved yet is simply left
 * `pending` and revisited on the next flush pass - see `core.ts`'s own
 * `isBlockedByDependency`.
 *
 * The backend's own reconciliation hook for this is `external_source`/
 * `external_id` (see this feature's own pre-implementation research -
 * reused here as `external_source: "offline_web_sync"`, `external_id:
 * <clientId>` on the create request), which lets the SERVER independently
 * confirm the mapping if this client ever needed to re-derive it (e.g.
 * after a hard refresh mid-flush, before this IndexedDB write below is
 * guaranteed to have committed) - see `README.md`'s "Reconciliation"
 * section for the fuller write-up of that fallback path.
 */

export async function recordIdMapping(
  db: TPlaneOfflineSyncDB,
  entityType: TMutableSyncEntity,
  clientId: string,
  serverId: string
): Promise<void> {
  await db.put("id_map", { clientId, entityType, serverId });
}

/** `undefined` means "still unresolved, keep deferring" - NOT the same as
 * "this was never a client id in the first place" (callers only look
 * this up for ids they already know are client-generated, e.g. because
 * they matched the shape/origin of a locally-created entity). */
export async function resolveClientId(db: TPlaneOfflineSyncDB, clientId: string): Promise<string | undefined> {
  const entry = await db.get("id_map", clientId);
  return entry?.serverId;
}
