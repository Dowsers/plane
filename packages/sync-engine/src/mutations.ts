/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TMutableSyncEntity, TMutationOperation, TMutationQueueEntry } from "./types";

/**
 * Category 12, feature 4 - factories for `TMutationQueueEntry`, kept in
 * one place so the "a `create` mutation's queue-entry `id` IS its
 * optimistic `entityId`" convention (see `types.ts`'s `dependsOnClientId`
 * docstring, and `id-map.ts`) is enforced here once rather than left to
 * every call site in `apps/web` to remember independently.
 */

export function generateClientId(): string {
  return crypto.randomUUID();
}

export interface TBuildCreateMutationParams {
  workspaceId: string;
  entityType: TMutableSyncEntity;
  projectId?: string;
  issueId?: string;
  payload: Record<string, unknown>;
  dependsOnClientId?: string;
}

/** The generated id is used as BOTH the queue entry's `id` (and therefore
 * the `Idempotency-Key` sent with the HTTP request) AND the optimistic
 * local `entityId` the caller should key its MobX/UI record with until
 * the real server id is known (see `id-map.ts`). */
export function buildCreateMutation(params: TBuildCreateMutationParams): TMutationQueueEntry {
  const id = generateClientId();
  const now = new Date().toISOString();
  return {
    id,
    workspaceId: params.workspaceId,
    entityType: params.entityType,
    entityId: id,
    operation: "create",
    payload: params.payload,
    route: { projectId: params.projectId, issueId: params.issueId },
    dependsOnClientId: params.dependsOnClientId,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    status: "pending",
    nextAttemptAt: 0,
  };
}

export interface TBuildUpdateOrDeleteMutationParams {
  workspaceId: string;
  entityType: TMutableSyncEntity;
  entityId: string;
  projectId?: string;
  issueId?: string;
  payload: Record<string, unknown>;
  baseUpdatedAt?: string;
  baseFieldValues?: Record<string, unknown>;
  dependsOnClientId?: string;
}

function buildMutation(operation: TMutationOperation, params: TBuildUpdateOrDeleteMutationParams): TMutationQueueEntry {
  const now = new Date().toISOString();
  return {
    id: generateClientId(),
    workspaceId: params.workspaceId,
    entityType: params.entityType,
    entityId: params.entityId,
    operation,
    payload: params.payload,
    route: { projectId: params.projectId, issueId: params.issueId },
    baseUpdatedAt: params.baseUpdatedAt,
    baseFieldValues: params.baseFieldValues,
    dependsOnClientId: params.dependsOnClientId,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    status: "pending",
    nextAttemptAt: 0,
  };
}

export function buildUpdateMutation(params: TBuildUpdateOrDeleteMutationParams): TMutationQueueEntry {
  return buildMutation("update", params);
}

export function buildDeleteMutation(params: TBuildUpdateOrDeleteMutationParams): TMutationQueueEntry {
  return buildMutation("delete", { ...params, payload: {} });
}
