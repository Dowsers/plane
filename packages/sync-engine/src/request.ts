/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TMutationQueueEntry, TSyncEngineInitConfig } from "./types";

/**
 * Category 12, feature 4 - maps a (resolved) `mutation_queue` entry onto
 * the real REST endpoint it replays against. Every one of these routes
 * already exists (this feature added no new mutation endpoints - only
 * the `Idempotency-Key` header support on the create ones, see
 * `README.md`); this module just knows their shapes.
 *
 * `external_source`/`external_id` are stamped onto every CREATE body -
 * this fork's existing Slack/intake-form client-reconciliation
 * convention (see this feature's own pre-implementation research),
 * reused here as `external_source: "offline_web_sync"`, `external_id:
 * <clientId>` so the server independently records the same mapping
 * `id-map.ts` keeps client-side (a fallback if this client ever needs to
 * re-derive "which client id became which server id" after, say, a hard
 * refresh mid-flush before the `id_map` write is guaranteed to have
 * committed - see `README.md`'s "Reconciliation" section).
 */

export const EXTERNAL_SOURCE = "offline_web_sync";

export interface TResolvedRequest {
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}

export interface TResolvedIds {
  entityId: string;
  issueId?: string;
}

/** `config.apiBaseUrl` is the bare origin (matches `API_BASE_URL` from
 * `@plane/constants`, e.g. `super(API_BASE_URL)` in every existing
 * `packages/services` class) - every path this fork's API exposes,
 * including these, is rooted at `/api/...`, never baked into the base
 * URL itself. */
function workspaceBase(config: TSyncEngineInitConfig): string {
  return `${config.apiBaseUrl}/api/workspaces/${config.workspaceSlug}`;
}

export function buildRequest(
  entry: TMutationQueueEntry,
  resolved: TResolvedIds,
  config: TSyncEngineInitConfig
): TResolvedRequest {
  const base = workspaceBase(config);
  const projectId = entry.route.projectId;

  if (entry.entityType === "issue") {
    if (!projectId) throw new Error("sync-engine: an `issue` mutation always needs route.projectId");
    if (entry.operation === "create") {
      return {
        url: `${base}/projects/${projectId}/issues/`,
        method: "POST",
        body: { ...entry.payload, external_source: EXTERNAL_SOURCE, external_id: entry.id },
      };
    }
    const issueUrl = `${base}/projects/${projectId}/issues/${resolved.entityId}/`;
    return entry.operation === "delete"
      ? { url: issueUrl, method: "DELETE" }
      : { url: issueUrl, method: "PATCH", body: entry.payload };
  }

  if (entry.entityType === "issue_comment") {
    if (!projectId || !resolved.issueId) {
      throw new Error("sync-engine: an `issue_comment` mutation always needs route.projectId and route.issueId");
    }
    const commentsBase = `${base}/projects/${projectId}/issues/${resolved.issueId}/comments/`;
    if (entry.operation === "create") {
      return {
        url: commentsBase,
        method: "POST",
        body: { ...entry.payload, external_source: EXTERNAL_SOURCE, external_id: entry.id },
      };
    }
    const commentUrl = `${commentsBase}${resolved.entityId}/`;
    return entry.operation === "delete"
      ? { url: commentUrl, method: "DELETE" }
      : { url: commentUrl, method: "PATCH", body: entry.payload };
  }

  // page - project-scoped when `route.projectId` is set, workspace-global
  // (Wiki) `WorkspacePageViewSet` otherwise (this fork has two real
  // page-creation endpoints, see this feature's own backend report).
  const pagesBase = projectId ? `${base}/projects/${projectId}/pages/` : `${base}/pages/`;
  if (entry.operation === "create") {
    return {
      url: pagesBase,
      method: "POST",
      body: { ...entry.payload, external_source: EXTERNAL_SOURCE, external_id: entry.id },
    };
  }
  const pageUrl = `${pagesBase}${resolved.entityId}/`;
  return entry.operation === "delete"
    ? { url: pageUrl, method: "DELETE" }
    : { url: pageUrl, method: "PATCH", body: entry.payload };
}
