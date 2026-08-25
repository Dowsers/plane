/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCachedEntity, TMutationQueueEntry, TSyncConflict } from "./types";

/**
 * Category 12, feature 4 - field-level last-write-wins conflict
 * resolution (exigence 8, and exigence 9's "notification explicite au
 * lieu d'un ecrasement silencieux"). Issue/IssueComment fields ONLY -
 * Page rich-text content must never go through this (see `README.md`'s
 * "Page body vs. LWW" section and this module's own warning below).
 *
 * The naive version of "last-write-wins" - just blindly PATCH whatever
 * the offline queue holds once back online - gets the actual semantics
 * backwards: it would make whichever HTTP request happens to reach the
 * database LAST win, and a request queued offline is by definition sent
 * LATE (well after the user's real edit), so a naive PATCH would let a
 * STALE offline edit clobber a NEWER online edit purely because of send
 * order, not real edit-time order. This module fixes that by comparing
 * real edit timestamps, per field, not request-arrival order:
 *
 * For every field the offline mutation touched:
 *   1. If the server's CURRENT value for that field still matches the
 *      value the client had cached for it right before the offline edit
 *      (`entry.baseFieldValues[field]`) - nobody else touched this
 *      specific field in the meantime, even if the entity's `updated_at`
 *      moved because of some OTHER field. Safe to send, no conflict.
 *   2. Otherwise, the server's current value for this field diverged
 *      from what the client started from - someone else genuinely
 *      changed this exact field while this client was offline. Compare
 *      WHEN: the server record's `updated_at` (their edit) vs this
 *      mutation's own `createdAt` (this client's real edit time,
 *      captured the moment the user made the change, not when it was
 *      finally sent). Whichever is chronologically later wins:
 *        - server's edit is later -> the server value stands, this
 *          field is dropped from the outgoing PATCH, and a
 *          `TSyncConflict` is returned so the caller can notify the user
 *          (toast + sync panel entry, exigence 9) and reset the local
 *          optimistic value back to the server's.
 *        - this mutation's `createdAt` is later (edge case - e.g. clock
 *          skew, or the "other" edit actually predates going offline and
 *          the cached snapshot just hadn't caught up yet) -> this
 *          client's value stands, sent as normal.
 *
 * This is intentionally still a per-FIELD, not a per-entity, comparison:
 * an offline edit to `priority` should never be discarded just because
 * someone else changed `assignee_ids` in the meantime - only a genuine
 * same-field race is a real conflict.
 */

export interface TFieldConflictResolution {
  fieldsToSend: Record<string, unknown>;
  conflicts: Array<Omit<TSyncConflict, "id" | "occurredAt">>;
}

export function resolveFieldLevelConflicts(
  entry: TMutationQueueEntry,
  serverSnapshot: TCachedEntity | undefined
): TFieldConflictResolution {
  // No baseline to compare against (a `create`, or an `update` whose
  // dependency wasn't resolved yet at enqueue time) - nothing to check,
  // send the payload as-is.
  if (!serverSnapshot || !entry.baseUpdatedAt || entry.operation !== "update") {
    return { fieldsToSend: entry.payload, conflicts: [] };
  }

  const serverUpdatedAt = typeof serverSnapshot.updated_at === "string" ? serverSnapshot.updated_at : undefined;
  if (!serverUpdatedAt || serverUpdatedAt <= entry.baseUpdatedAt) {
    // Nothing changed server-side since this mutation's own baseline -
    // no conflict possible.
    return { fieldsToSend: entry.payload, conflicts: [] };
  }

  const fieldsToSend: Record<string, unknown> = {};
  const conflicts: Array<Omit<TSyncConflict, "id" | "occurredAt">> = [];
  const baseFieldValues = entry.baseFieldValues ?? {};

  for (const [field, localValue] of Object.entries(entry.payload)) {
    const serverValue = serverSnapshot[field];
    const baseValue = baseFieldValues[field];

    const serverDivergedFromBase = JSON.stringify(serverValue) !== JSON.stringify(baseValue);
    if (!serverDivergedFromBase) {
      fieldsToSend[field] = localValue;
      continue;
    }

    const serverEditIsLater = serverUpdatedAt > entry.createdAt;
    if (serverEditIsLater) {
      conflicts.push({
        entityType: entry.entityType,
        entityId: entry.entityId,
        field,
        discardedLocalValue: localValue,
        serverValue,
      });
    } else {
      fieldsToSend[field] = localValue;
    }
  }

  return { fieldsToSend, conflicts };
}
