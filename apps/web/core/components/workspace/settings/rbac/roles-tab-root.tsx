/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import type { TPermission, TWorkspaceRole } from "@plane/types";
import { Loader } from "@plane/ui";
// services
import workspaceRBACService from "@/services/workspace-rbac.service";
// local imports
import { CreateRoleModal } from "./create-role-modal";
import { DeleteRoleModal } from "./delete-role-modal";
import { RoleEditorModal } from "./role-editor-modal";
import { RoleListItem } from "./role-list-item";

type Props = {
  workspaceSlug: string;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - Workspace Settings > Members > Roles tab
 * root: list of roles (system roles first - backend's own
 * `WorkspaceRole.Meta.ordering = ("-is_system", "name")`), create/edit/
 * delete flows. Gated at the page level (Admin nav visibility, real
 * enforcement via the backend's own 403 on every RBAC endpoint) - see
 * `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/page.tsx`.
 */
export const RolesTabRoot = observer(function RolesTabRoot(props: Props) {
  const { workspaceSlug } = props;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<TWorkspaceRole | null>(null);
  const [deletingRole, setDeletingRole] = useState<TWorkspaceRole | null>(null);

  const {
    data: roles,
    isLoading: isRolesLoading,
    mutate: mutateRoles,
  } = useSWR(["RBAC_ROLES", workspaceSlug], () => workspaceRBACService.listRoles(workspaceSlug));
  const { data: schemes } = useSWR(["RBAC_SCHEMES", workspaceSlug], () =>
    workspaceRBACService.listPermissionSchemes(workspaceSlug)
  );
  const { data: catalogue } = useSWR(["RBAC_CATALOGUE", workspaceSlug], () =>
    workspaceRBACService.getPermissionCatalogue(workspaceSlug)
  );

  const catalogueByKey = useMemo(() => {
    const map: Record<string, TPermission> = {};
    if (!catalogue) return map;
    Object.values(catalogue)
      .flat()
      .forEach((permission) => {
        map[permission.key] = permission;
      });
    return map;
  }, [catalogue]);

  const handleRoleUpdated = (updated: TWorkspaceRole) => {
    setEditingRole(updated);
    void mutateRoles((current) => current?.map((role) => (role.id === updated.id ? updated : role)), {
      revalidate: false,
    });
  };

  if (isRolesLoading || !roles) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="72px" />
        <Loader.Item height="72px" />
        <Loader.Item height="72px" />
      </Loader>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-body-xs-regular text-tertiary">
          A role&apos;s effective permissions are the union of every bundle attached to it. Admin/Member/Guest are
          built-in and cannot be deleted.
        </p>
        <Button variant="primary" size="lg" onClick={() => setIsCreateOpen(true)} className="shrink-0">
          Create role
        </Button>
      </div>

      <div className="flex flex-col">
        {roles.map((role) => (
          <RoleListItem
            key={role.id}
            role={role}
            catalogueByKey={catalogueByKey}
            onEdit={() => setEditingRole(role)}
            onDelete={() => setDeletingRole(role)}
          />
        ))}
      </div>

      <CreateRoleModal
        workspaceSlug={workspaceSlug}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(role) => {
          void mutateRoles();
          setEditingRole(role);
        }}
      />

      {editingRole && (
        <RoleEditorModal
          workspaceSlug={workspaceSlug}
          role={editingRole}
          allSchemes={schemes}
          catalogueByKey={catalogueByKey}
          isOpen={Boolean(editingRole)}
          onClose={() => setEditingRole(null)}
          onUpdated={handleRoleUpdated}
        />
      )}

      {deletingRole && (
        <DeleteRoleModal
          workspaceSlug={workspaceSlug}
          role={deletingRole}
          allRoles={roles}
          isOpen={Boolean(deletingRole)}
          onClose={() => setDeletingRole(null)}
          onDeleted={() => {
            setDeletingRole(null);
            void mutateRoles();
          }}
        />
      )}
    </div>
  );
});
