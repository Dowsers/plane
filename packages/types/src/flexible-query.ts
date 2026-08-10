/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Types for the workspace-level flexible query layer (category 8, feature
// 1) - see docs/feature-specs/08-api-webhooks-cli.md ("Couche de requetes
// flexible facon GraphQL") in plane-selfhost, and the backend half of this
// feature: apps/api/plane/api/views/flexible_query.py (token-authenticated
// execution/introspection), apps/api/plane/app/views/flexible_query.py
// (session-authenticated settings), apps/api/plane/utils/flexible_query/.

/** `GET`/`PATCH /api/workspaces/{slug}/query-settings/` - session
 * authenticated, PATCH is Workspace Admin only. The `is_enabled` toggle
 * itself is NOT here - it's the flat `Workspace.is_flexible_query_enabled`
 * boolean, set through the generic workspace PATCH endpoint instead (see
 * `WorkspaceQuerySettingsEndpoint`'s own docstring for why). */
export type TWorkspaceQuerySettings = {
  id: string;
  workspace_id: string;
  max_depth: number;
  max_cost: number;
  timeout_ms: number;
};

/** Body accepted by `POST /api/v1/workspaces/{slug}/query/` - deliberately
 * loose (`Record<string, unknown>` for `filters`/`include`) rather than a
 * fully-typed AST: the whitelist of entities/fields/relations is defined
 * server-side (`plane/utils/flexible_query/registry.py`) and exposed live
 * via the schema endpoint, so the tester UI drives off that response
 * rather than a hardcoded client-side mirror of it. */
export type TFlexibleQueryRequest = {
  entity: string;
  filters?: Record<string, unknown>;
  fields?: string[];
  include?: Record<string, unknown>;
  limit?: number;
  cursor?: string | null;
};

/** Successful (HTTP 200) response - note `errors` can be non-empty even
 * here (partial resolution of a nested branch), it does not imply the
 * whole request failed. */
export type TFlexibleQueryResponse = {
  data: unknown[];
  errors: Array<{ path?: string; message?: string; code?: string } | string>;
  next_cursor: string | null;
  cost: number;
};

/** HTTP 400/504 error shape from either endpoint. `code` is one of
 * `invalid_entity`/`unknown_field`/`unknown_relation`/`max_depth_exceeded`/
 * `cost_exceeded`/`invalid_filters`/`timeout`/etc - see
 * `FlexibleQueryError`/`FlexibleQueryBranchTimeout` in
 * `plane/utils/flexible_query/exceptions.py`. */
export type TFlexibleQueryError = {
  error: string;
  code?: string;
  cost?: number;
};

/** `GET /api/v1/workspaces/{slug}/query/schema/` response - raw
 * introspection payload, intentionally untyped beyond "an object": the
 * tester UI renders it as-is rather than parsing it into a typed schema
 * browser (out of scope for this v1, see this feature's own README). */
export type TFlexibleQuerySchema = Record<string, unknown>;
