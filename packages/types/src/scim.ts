/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 2 ("SCIM 2.0 natif") - frontend types for the
 * ADMIN-facing "manage my SCIM setup" surface
 * (`plane.app.views.workspace.scim_admin`, apps/api), matching
 * `SCIMTokenReadSerializer`/`SCIMTokenWriteSerializer`
 * (apps/api/plane/app/serializers/scim.py) exactly. Deliberately NOT
 * types for the `/api/scim/v2/*` protocol surface itself (`plane.scim`) -
 * nothing in this frontend checkpoint calls that surface directly, IdPs
 * do.
 *
 * The SCIM provisioning log itself has no dedicated types here - it is a
 * filtered slice of the already-typed `WorkspaceAuditLog`
 * (`TWorkspaceAuditLogListItem`/`TWorkspaceAuditLogDetail`, see
 * packages/types/src/audit.ts), scoped to `SCIM_AUDIT_EVENT_TYPES`
 * (@plane/constants) - reused as-is rather than duplicated.
 */

/** `GET /api/workspaces/<slug>/scim/tokens/` list item - `token_hash` is
 * never included (`SCIMTokenReadSerializer.Meta.exclude = ("token_hash",)`),
 * the raw value is never re-shown after creation. */
export type TSCIMToken = {
  id: string;
  workspace: string;
  label: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  created_by: string | null;
};

/** `POST /api/workspaces/<slug>/scim/tokens/` response shape only
 * (`SCIMTokenWriteSerializer`) - `token` is the raw Bearer value, present
 * exactly once, on this response alone. Never returned by the list
 * endpoint above. */
export type TSCIMTokenCreateResponse = TSCIMToken & {
  token: string;
};

export type TSCIMTokenCreatePayload = {
  label?: string;
};
