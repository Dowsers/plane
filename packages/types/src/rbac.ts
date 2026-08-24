/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 ("Constructeur de roles personnalises") -
 * frontend types matching `Permission`/`PermissionScheme`/
 * `PermissionSchemeItem`/`WorkspaceRole`/`WorkspaceRoleScheme`
 * (apps/api/plane/db/models/rbac.py) and their serializers
 * (apps/api/plane/app/serializers/rbac.py) exactly - see the backend's own
 * build report (commit 8da6214f0) for the full per-endpoint reasoning.
 *
 * v1 scope reminder (do not "fix" this in the UI - it is deliberate, see
 * the backend commit's own decisions #5/#6): only the 5 in-scope domains
 * (Issue/Cycle/Module/Page/View) plus the symbolic WORKSPACE category
 * exist in the catalogue - every other domain (billing, integrations,
 * exports) stays on the fixed legacy role checks and has no representation
 * here at all.
 */

export type TPermissionCategory = "ISSUE" | "CYCLE" | "MODULE" | "PAGE" | "VIEW" | "WORKSPACE";

export type TPermissionCondition = "NONE" | "CREATOR_ONLY" | "PROJECT_LEAD_ONLY";

/** `GET /api/workspaces/<slug>/permissions/` catalogue entry - read-only,
 * seeded by a data migration, never created/edited via the API. */
export type TPermission = {
  id: string;
  key: string;
  category: TPermissionCategory;
  label: string;
  description: string;
  /** Conditions this permission may be configured with on a
   * `PermissionSchemeItem` - always includes `"NONE"`. A permission whose
   * domain has no parent project at all (e.g. every `WORKSPACE` entry)
   * never includes `"PROJECT_LEAD_ONLY"` here - the condition selector for
   * that row must be disabled rather than silently accepting a choice the
   * backend will reject at write time (exigence 8). */
  supported_conditions: TPermissionCondition[];
};

/** `GET /api/workspaces/<slug>/permissions/` response shape - grouped by
 * category (every `TPermissionCategory` key is always present, possibly
 * with an empty array). */
export type TPermissionCatalogue = Record<TPermissionCategory, TPermission[]>;

export type TPermissionSchemeItem = {
  id: string;
  permission: TPermission;
  condition: TPermissionCondition;
};

/** One line of the `items` array a bundle create/update body sends. */
export type TPermissionSchemeItemInput = {
  permission_id: string;
  condition: TPermissionCondition;
};

/** The "bundle" - `workspace: null` marks one of the 3 global, shared
 * system baseline bundles (read-only, cannot be edited/deleted, only
 * attached/detached from a role). */
export type TPermissionScheme = {
  id: string;
  workspace: string | null;
  name: string;
  description: string;
  is_system: boolean;
  items: TPermissionSchemeItem[];
  created_at: string;
  updated_at: string;
};

export type TPermissionSchemeCreatePayload = {
  name: string;
  description?: string;
  items?: TPermissionSchemeItemInput[];
};

/** Full-replace semantics for `items` (matches the backend's own
 * `PermissionSchemeViewSet.partial_update` - the whole desired table is
 * sent back on every save, not a diff). */
export type TPermissionSchemeUpdatePayload = Partial<{
  name: string;
  description: string;
  items: TPermissionSchemeItemInput[];
}>;

export type TWorkspaceRoleSchemeSummary = {
  id: string;
  name: string;
};

/** `{permission_key: [conditions...]}` - a permission present with
 * `"NONE"` in its condition list is granted unconditionally (see
 * `plane.utils.rbac._compute_role_permissions`'s own docstring for the
 * "NONE is absorbing" union semantics, exigence 3). */
export type TEffectivePermissionsMap = Record<string, TPermissionCondition[]>;

export type TWorkspaceRole = {
  id: string;
  workspace: string;
  name: string;
  description: string;
  is_system: boolean;
  /** 20 (Admin) / 15 (Member) / 5 (Guest) for a system role, or the value
   * a custom role was created/edited with (exigence 5's "decision #5"
   * legacy-integer bridge) - never null for a role actually in use. */
  legacy_role_value: number | null;
  /** True ONLY for the system Admin role - protects
   * `workspace.delete`/`workspace.manage_billing`/`workspace.manage_members`
   * from ever being left uncovered (exigence 4's anti-lockout guard). This
   * is NOT a model of workspace Ownership - see this file's own module
   * docstring and `IWorkspaceMember.is_owner` (packages/types/src/
   * workspace.ts) for the real, independent ownership mechanic. */
  is_owner_equivalent: boolean;
  schemes: TWorkspaceRoleSchemeSummary[];
  effective_permissions: TEffectivePermissionsMap;
  member_count: number;
  created_at: string;
  updated_at: string;
};

export type TWorkspaceRoleCreatePayload = {
  name: string;
  description?: string;
  /** Required on create (decision #5's anti-regression bridge) - must be
   * one of 20/15/5. */
  legacy_role_value: number;
};

export type TWorkspaceRoleUpdatePayload = Partial<{
  name: string;
  description: string;
  legacy_role_value: number;
}>;

/** `POST /api/workspaces/<slug>/roles/<role_id>/schemes/` body - replaces
 * the role's ENTIRE attached-schemes set (atomic attach/detach). */
export type TRoleSchemesAttachPayload = {
  scheme_ids: string[];
};

/** Shape of the 400 body when a bundle is attached to one or more roles
 * (`PermissionSchemeViewSet.destroy`). */
export type TSchemeDeleteBlockedError = {
  error: string;
  role_count: number;
};

/** Shape of the 400 body when a role is held by one or more members
 * (`WorkspaceRoleViewSet.destroy`, exigence 7). */
export type TRoleDeleteBlockedError = {
  error: string;
  member_count: number;
};

/** Shape of the 400 body when a schemes-attach would strip a protected
 * permission from the Admin-equivalent role (exigence 4) or customize the
 * Guest role (exigence 5). */
export type TRoleSchemesAttachBlockedError = {
  error: string;
  missing_permissions?: string[];
};

/** One entry of `GET /api/workspaces/<slug>/my-permissions/`'s
 * `permissions` array - the catalogue metadata (category/label/
 * description) merged with this user's resolved conditions for that key.
 * Self-service counterpart added during the frontend pass for this
 * feature (spec user story 5) - see `MyEffectivePermissionsEndpoint`
 * (apps/api/plane/app/views/workspace/rbac.py). */
export type TMyEffectivePermission = {
  key: string;
  category: TPermissionCategory;
  label: string;
  description: string;
  conditions: TPermissionCondition[];
};

export type TMyEffectivePermissionsResponse = {
  role: { id: string; name: string; is_system: boolean } | null;
  permissions: TMyEffectivePermission[];
};
