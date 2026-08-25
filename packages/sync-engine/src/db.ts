/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { deleteDB, openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type {
  TCachedEntity,
  TIdMapEntry,
  TMetaEntry,
  TMutableSyncEntity,
  TMutationQueueEntry,
  TProjectLruEntry,
} from "./types";

/**
 * Category 12, feature 4 - IndexedDB schema, scoped one database PER
 * WORKSPACE (exigence 10 - "le cache IndexedDB est scelle par
 * workspace"). Using `idb` (https://github.com/jakearchibald/idb) rather
 * than Dexie - see this package's own README for the full reasoning;
 * short version: `idb` is a ~1.2kB, dependency-free, typed Promise
 * wrapper around the *native* IndexedDB API with no extra runtime
 * abstraction of its own (no separate query language, no schema-migration
 * DSL to learn) - everything this feature needs (a handful of object
 * stores, a couple of indexes, simple key/range lookups) is well within
 * plain IndexedDB's own capabilities, so Dexie's much larger surface
 * (reactive queries, its own transaction/relational-ish query builder)
 * would be paying for abstraction this feature never exercises. `idb`'s
 * types come from the package itself (no extra `@types/*` dependency).
 */

const DB_NAME_PREFIX = "plane-offline-sync";
const DB_VERSION = 1;

export const MUTABLE_ENTITY_STORE_NAMES = {
  issue: "entities:issue",
  issue_comment: "entities:issue_comment",
  page: "entities:page",
} as const satisfies Record<TMutableSyncEntity, string>;

export const REFERENCE_ENTITY_STORE_NAMES = {
  cycle: "entities:cycle",
  module: "entities:module",
  label: "entities:label",
  state: "entities:state",
} as const;

export const ALL_ENTITY_STORE_NAMES = {
  ...MUTABLE_ENTITY_STORE_NAMES,
  ...REFERENCE_ENTITY_STORE_NAMES,
} as const;

export interface PlaneOfflineSyncDBSchema extends DBSchema {
  mutation_queue: {
    key: string;
    value: TMutationQueueEntry;
    indexes: {
      "by-status": string;
      "by-entity-type-status": [string, string];
      "by-created-at": string;
    };
  };
  "entities:issue": { key: string; value: TCachedEntity; indexes: { "by-project": string } };
  "entities:issue_comment": { key: string; value: TCachedEntity; indexes: { "by-project": string } };
  "entities:page": { key: string; value: TCachedEntity; indexes: { "by-project": string } };
  "entities:cycle": { key: string; value: TCachedEntity; indexes: { "by-project": string } };
  "entities:module": { key: string; value: TCachedEntity; indexes: { "by-project": string } };
  "entities:label": { key: string; value: TCachedEntity; indexes: { "by-project": string } };
  "entities:state": { key: string; value: TCachedEntity; indexes: { "by-project": string } };
  id_map: { key: string; value: TIdMapEntry };
  meta: { key: string; value: TMetaEntry };
  project_lru: { key: string; value: TProjectLruEntry; indexes: { "by-last-viewed": number } };
}

export type TPlaneOfflineSyncDB = IDBPDatabase<PlaneOfflineSyncDBSchema>;

function dbName(workspaceId: string): string {
  return `${DB_NAME_PREFIX}:${workspaceId}`;
}

export async function openWorkspaceDb(workspaceId: string): Promise<TPlaneOfflineSyncDB> {
  return openDB<PlaneOfflineSyncDBSchema>(dbName(workspaceId), DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("mutation_queue")) {
        const store = db.createObjectStore("mutation_queue", { keyPath: "id" });
        store.createIndex("by-status", "status");
        store.createIndex("by-entity-type-status", ["entityType", "status"]);
        store.createIndex("by-created-at", "createdAt");
      }
      for (const storeName of Object.values(ALL_ENTITY_STORE_NAMES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: "id" });
          store.createIndex("by-project", "_projectId");
        }
      }
      if (!db.objectStoreNames.contains("id_map")) {
        db.createObjectStore("id_map", { keyPath: "clientId" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("project_lru")) {
        const store = db.createObjectStore("project_lru", { keyPath: "projectId" });
        store.createIndex("by-last-viewed", "lastViewedAt");
      }
    },
  });
}

/** Exigence 10/11 - full purge on logout/session-expiry/workspace-switch
 * or access revocation. Deletes the ENTIRE per-workspace database
 * (mutation_queue included) - only ever call this for logout/session
 * expiry/workspace switch (all in-flight work for that workspace is
 * intentionally abandoned), never as part of the LRU quota eviction
 * path (`cache.ts`'s `evictLeastRecentlyViewedProject` is careful to
 * never touch `mutation_queue` - see that function's own docstring). */
export async function deleteWorkspaceDb(workspaceId: string): Promise<void> {
  await deleteDB(dbName(workspaceId));
}

/** Best-effort enumeration of every cached workspace database this
 * browser profile currently holds - used to purge everything on a full
 * sign-out (a user may have opened more than one workspace on this
 * device). Falls back to an empty list on browsers without
 * `indexedDB.databases()` (Firefox added support in v126; older
 * versions simply won't get this extra sweep - the per-workspace purge
 * on logout/switch below still covers the common case). */
export async function listCachedWorkspaceIds(): Promise<string[]> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];
  const databases = await indexedDB.databases();
  return databases
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string" && name.startsWith(`${DB_NAME_PREFIX}:`))
    .map((name) => name.slice(DB_NAME_PREFIX.length + 1));
}
