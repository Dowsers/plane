/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 ("Constructeur de roles personnalises") -
 * client for the new RBAC catalogue/bundle/role surface
 * (`plane.app.views.workspace.rbac`) plus the self-service
 * "my-permissions" endpoint added during this frontend pass. Sibling to
 * `WorkspaceSecurityService`/`WorkspaceSCIMService` rather than folded
 * into `WorkspaceService` - a distinct, independently-gated management
 * surface (every method below except `getMyEffectivePermissions` is
 * gated by `workspace.manage_roles`/Owner, a 403 for anyone else).
 */
import { API_BASE_URL } from "@plane/constants";
import type {
  IWorkspaceMember,
  TMyEffectivePermissionsResponse,
  TPermissionCatalogue,
  TPermissionScheme,
  TPermissionSchemeCreatePayload,
  TPermissionSchemeUpdatePayload,
  TRoleSchemesAttachPayload,
  TWorkspaceRole,
  TWorkspaceRoleCreatePayload,
  TWorkspaceRoleUpdatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class WorkspaceRBACService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** GET /api/workspaces/<slug>/permissions/ - read-only catalogue,
   * grouped by category (exigence 1). Gated by `workspace.manage_roles`/
   * Owner, same as every other method below except `getMyEffectivePermissions`. */
  async getPermissionCatalogue(workspaceSlug: string): Promise<TPermissionCatalogue> {
    return this.get(`/api/workspaces/${workspaceSlug}/permissions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/permission-schemes/ - global system
   * bundles (`workspace: null`) and this workspace's own custom bundles. */
  async listPermissionSchemes(workspaceSlug: string): Promise<TPermissionScheme[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/permission-schemes/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPermissionScheme(
    workspaceSlug: string,
    data: TPermissionSchemeCreatePayload
  ): Promise<TPermissionScheme> {
    return this.post(`/api/workspaces/${workspaceSlug}/permission-schemes/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** PATCH - `items` (if provided) fully REPLACES the bundle's permission
   * set (exigence 2's own UX sends the whole desired table back on every
   * save, see the backend's own `partial_update` docstring). Rejected
   * with a 400 for a system bundle (`is_system`/`workspace === null`). */
  async updatePermissionScheme(
    workspaceSlug: string,
    schemeId: string,
    data: TPermissionSchemeUpdatePayload
  ): Promise<TPermissionScheme> {
    return this.patch(`/api/workspaces/${workspaceSlug}/permission-schemes/${schemeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** DELETE - 400 (with `role_count`) if this bundle is attached to one
   * or more roles - detach it from every role first. */
  async deletePermissionScheme(workspaceSlug: string, schemeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/permission-schemes/${schemeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/roles/ - system roles (Admin/Member/Guest,
   * `is_system: true`) first, then this workspace's own custom roles. */
  async listRoles(workspaceSlug: string): Promise<TWorkspaceRole[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/roles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRole(workspaceSlug: string, data: TWorkspaceRoleCreatePayload): Promise<TWorkspaceRole> {
    return this.post(`/api/workspaces/${workspaceSlug}/roles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** PATCH - `name`/`description`/`legacy_role_value` only; `is_system`/
   * `is_owner_equivalent` are always read-only (400 if sent), and
   * `legacy_role_value` is additionally read-only for a system role. */
  async updateRole(workspaceSlug: string, roleId: string, data: TWorkspaceRoleUpdatePayload): Promise<TWorkspaceRole> {
    return this.patch(`/api/workspaces/${workspaceSlug}/roles/${roleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** DELETE - 400 for a system role, or (with `member_count`) if one or
   * more members still hold this role - reassign them first via
   * `getRoleMembers`/the members list before retrying (exigence 7, no
   * silent cascade). */
  async deleteRole(workspaceSlug: string, roleId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/roles/${roleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST /api/workspaces/<slug>/roles/<role_id>/schemes/ - atomic
   * attach/detach: `scheme_ids` REPLACES the role's entire attached-bundle
   * set. 400s: Guest role (exigence 5, non-customizable), or a change that
   * would strip a protected permission from the Admin-equivalent role
   * (exigence 4, `missing_permissions` in the body). */
  async setRoleSchemes(
    workspaceSlug: string,
    roleId: string,
    data: TRoleSchemesAttachPayload
  ): Promise<TWorkspaceRole> {
    return this.post(`/api/workspaces/${workspaceSlug}/roles/${roleId}/schemes/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/roles/<role_id>/members/ - members
   * currently holding this role (exigence 7's reassign-before-delete UX). */
  async getRoleMembers(workspaceSlug: string, roleId: string): Promise<IWorkspaceMember[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/roles/${roleId}/members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/my-permissions/ - the CALLING user's own
   * resolved effective permissions in this workspace (spec's own user
   * story 5). Unlike every other method above, gated only by plain
   * workspace membership (`WorkspaceViewerPermission`), not
   * `workspace.manage_roles` - see `MyEffectivePermissionsEndpoint`'s own
   * docstring. */
  async getMyEffectivePermissions(workspaceSlug: string): Promise<TMyEffectivePermissionsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/my-permissions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const workspaceRBACService = new WorkspaceRBACService();

export default workspaceRBACService;
