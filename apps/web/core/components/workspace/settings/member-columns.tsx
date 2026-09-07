/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";

import { Disclosure } from "@headlessui/react";
import { Crown, KeyRound } from "lucide-react";
// plane imports
import { ROLE, EUserPermissions, EUserPermissionsLevel, MEMBER_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TrashIcon, SuspendedUserIcon } from "@plane/propel/icons";
import { Pill, EPillVariant, EPillSize } from "@plane/propel/pill";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUser, IWorkspaceMember } from "@plane/types";
// plane ui
import { AlertModalCore, CustomSelect, PopoverMenu } from "@plane/ui";
// helpers
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import workspaceRBACService from "@/services/workspace-rbac.service";
// local imports
import { SystemBadge } from "@/components/workspace/settings/rbac/system-badge";

export interface RowData {
  member: IWorkspaceMember;
  role: EUserPermissions;
  is_active: boolean;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 5 - despite `RowData.member` being typed as
  // `IWorkspaceMember` above, `WorkspaceMembersListItem`
  // (apps/web/core/components/workspace/settings/members-list-item.tsx)
  // force-casts an `IWorkspaceMember[]` (whose OWN top-level `is_owner`
  // field - see packages/types/src/workspace.ts - sits alongside `member`/
  // `role`/`is_active`) into `RowData[]`, so this field really is present
  // on every `rowData` at runtime, matching `role`/`is_active` above.
  is_owner?: boolean;
  // Category 11, feature 2 ("SCIM 2.0 natif") - same reasoning as
  // `is_owner` above: `WorkspaceMember.scim_managed` is a top-level field
  // on the raw membership row (`IWorkspaceMember.scim_managed`), not
  // nested under `.member` (which holds `User`-level fields like
  // `is_sso_provisioned`). Drives the "Managed by SCIM" badge and the
  // manual-edit warning below.
  scim_managed?: boolean;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 4 - same reasoning as `is_owner`/
  // `scim_managed` above: `WorkspaceMember.custom_role` (see
  // `IWorkspaceMember.custom_role`'s own comment, packages/types/src/
  // workspace.ts) is a top-level field on the raw membership row.
  custom_role?: string | null;
}

type NameProps = {
  rowData: RowData;
  workspaceSlug: string;
  isAdmin: boolean;
  currentUser: IUser | undefined;
  setRemoveMemberModal: (rowData: RowData) => void;
  setResetPasswordModal: (rowData: RowData) => void;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 5 - only ever invoked for the current
  // Owner's own row (see the `isCurrentUser && rowData.is_owner` guard
  // below), so a plain optional prop is enough - every other row simply
  // never offers the option.
  setTransferOwnershipModal?: () => void;
};

type AccountTypeProps = {
  rowData: RowData;
  workspaceSlug: string;
};

export function NameColumn(props: NameProps) {
  const {
    rowData,
    workspaceSlug,
    isAdmin,
    currentUser,
    setRemoveMemberModal,
    setResetPasswordModal,
    setTransferOwnershipModal,
  } = props;
  // i18n
  const { t } = useTranslation();
  // derived values
  const { avatar_url, display_name, email, first_name, id, last_name } = rowData.member;
  const isSuspended = rowData.is_active === false;
  const isCurrentUser = id === currentUser?.id;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 5 - "Transfer ownership" is only ever offered
  // on the current Owner's own row.
  const canTransferOwnership = isCurrentUser && rowData.is_owner && Boolean(setTransferOwnershipModal);
  // Password reset is admin-only and never offered on the admin's own row -
  // an admin resetting their own password should go through their normal
  // account settings instead.
  const canResetPassword = isAdmin && !isCurrentUser;
  const menuItems: Array<"transfer" | "reset_password" | "remove"> = [
    ...(canTransferOwnership ? (["transfer"] as const) : []),
    ...(canResetPassword ? (["reset_password"] as const) : []),
    "remove",
  ];

  return (
    <Disclosure>
      {() => (
        <div className="group relative">
          <div className="flex w-72 items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-1 items-center gap-x-2 gap-y-2">
              {isSuspended ? (
                <div className="rounded-full bg-layer-1">
                  <SuspendedUserIcon className="size-6 text-placeholder" />
                </div>
              ) : avatar_url && avatar_url.trim() !== "" ? (
                <Link href={`/${workspaceSlug}/profile/${id}`}>
                  <span className="relative flex size-6 items-center justify-center rounded-full text-on-color capitalize">
                    <img
                      src={getFileURL(avatar_url)}
                      className="absolute top-0 left-0 h-full w-full rounded-full object-cover"
                      alt={display_name || email}
                    />
                  </span>
                </Link>
              ) : (
                <Link href={`/${workspaceSlug}/profile/${id}`}>
                  <span className="relative flex size-6 items-center justify-center rounded-full bg-layer-3 text-11 text-tertiary capitalize">
                    {(email ?? display_name ?? "?")[0]}
                  </span>
                </Link>
              )}
              <span className={isSuspended ? "text-placeholder" : ""}>
                {first_name} {last_name}
              </span>
              {rowData.is_owner && (
                <Tooltip tooltipContent={t("workspace_settings.settings.members.columns.workspace_owner")}>
                  <Crown
                    className="size-3.5 shrink-0 text-warning-primary"
                    aria-label={t("workspace_settings.settings.members.columns.workspace_owner")}
                  />
                </Tooltip>
              )}
            </div>

            {!isSuspended && (isAdmin || isCurrentUser) && (
              <PopoverMenu
                data={menuItems}
                keyExtractor={(item) => item}
                popoverClassName="justify-end"
                buttonClassName="outline-none	origin-center rotate-90 size-8 aspect-square flex-shrink-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                render={(item) =>
                  item === "transfer" ? (
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-x-3"
                      onClick={() => setTransferOwnershipModal?.()}
                    >
                      <Crown className="size-3.5 align-middle" />{" "}
                      {t("workspace_settings.settings.members.columns.transfer_ownership")}
                    </button>
                  ) : item === "reset_password" ? (
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-x-3"
                      onClick={() => setResetPasswordModal(rowData)}
                    >
                      <KeyRound className="size-3.5 align-middle" /> Reset password
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-x-3"
                      onClick={() => setRemoveMemberModal(rowData)}
                      data-ph-element={MEMBER_TRACKER_ELEMENTS.WORKSPACE_MEMBER_TABLE_CONTEXT_MENU}
                    >
                      <TrashIcon className="size-3.5 align-middle" />{" "}
                      {isCurrentUser
                        ? t("workspace_settings.settings.members.columns.leave")
                        : t("workspace_settings.settings.members.columns.remove")}
                    </button>
                  )
                }
              />
            )}
          </div>
        </div>
      )}
    </Disclosure>
  );
}

export const AccountTypeColumn = observer(function AccountTypeColumn(props: AccountTypeProps) {
  const { rowData, workspaceSlug } = props;
  // i18n
  const { t } = useTranslation();
  // state
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 2 ("SCIM 2.0 natif") - the spec's own UX note
  // ("avertissement si un Admin tente de modifier manuellement le role...
  // d'un membre scim_managed=True") - a SOFT warning only, the backend
  // never blocks this (`WorkspaceMemberAdminSerializer`'s own PATCH has no
  // such check), so a role change on a SCIM-managed row is held behind one
  // extra confirmation step instead of applying immediately like every
  // other row. Now holds a `WorkspaceRole` id (feature 4) rather than a
  // legacy `EUserPermissions` int.
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [isConfirmingRoleChange, setIsConfirmingRoleChange] = useState(false);
  // store hooks
  const { allowPermissions } = useUserPermissions();

  const {
    workspace: { updateMember },
  } = useMember();
  const { data: currentUser } = useUser();

  // derived values
  const isCurrentUser = currentUser?.id === rowData.member.id;
  const isAdminRole = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const isRoleNonEditable = isCurrentUser || !isAdminRole;
  const isSuspended = rowData.is_active === false;

  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 4 - the role selector is now driven by
  // `GET /roles/` instead of the 3 hardcoded legacy values (spec's own UI
  // section). Only fetched for an Admin (the only caller who can both see
  // this control AND has `workspace.manage_roles` via the system Admin
  // role's own baseline scheme, see `WorkspaceManageRolesPermission`) - a
  // Member/Guest viewing this same list would otherwise get a 403.
  const { data: roles } = useSWR(
    isAdminRole && workspaceSlug ? ["RBAC_ROLES", workspaceSlug] : null,
    () => workspaceRBACService.listRoles(workspaceSlug.toString()),
    { revalidateOnFocus: false }
  );

  const resolvedRole =
    roles?.find((role) => role.id === rowData.custom_role) ??
    roles?.find((role) => role.is_system && role.legacy_role_value === rowData.role);
  const displayLabel = resolvedRole?.name ?? ROLE[rowData.role];

  const applyRoleChange = async (roleId: string) => {
    if (!workspaceSlug) return;
    try {
      await updateMember(workspaceSlug.toString(), rowData.member.id, { custom_role_id: roleId });
    } catch (err: unknown) {
      const error = err as { error?: string | string[] };
      const errorString = Array.isArray(error?.error) ? error.error[0] : error?.error;

      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: errorString ?? "An error occurred while updating member role. Please try again.",
      });
    }
  };

  const handleRoleChange = async (roleId: string) => {
    if (rowData.scim_managed) {
      setPendingRoleId(roleId);
      return;
    }
    await applyRoleChange(roleId);
  };

  const handleConfirmRoleChange = async () => {
    if (pendingRoleId === null) return;
    setIsConfirmingRoleChange(true);
    await applyRoleChange(pendingRoleId);
    setIsConfirmingRoleChange(false);
    setPendingRoleId(null);
  };

  return (
    <>
      {isSuspended ? (
        <div className="flex w-32">
          <Pill variant={EPillVariant.DEFAULT} size={EPillSize.SM} className="border-none">
            {t("workspace_settings.settings.members.columns.suspended")}
          </Pill>
        </div>
      ) : isRoleNonEditable || !roles ? (
        <div className="flex w-32 items-center gap-1.5">
          <span>{displayLabel}</span>
          {resolvedRole?.is_system && <SystemBadge />}
        </div>
      ) : (
        <CustomSelect
          value={resolvedRole?.id}
          onChange={(value: string) => {
            void handleRoleChange(value);
          }}
          label={
            <div className="flex items-center gap-1.5">
              <span>{displayLabel}</span>
              {resolvedRole?.is_system && <SystemBadge />}
            </div>
          }
          buttonClassName="!px-0 !justify-start hover:bg-surface-1 border-none"
          className="w-40 rounded-md p-0"
          input
        >
          {roles.map((role) => (
            <CustomSelect.Option key={role.id} value={role.id}>
              <span className="flex items-center gap-1.5">
                {role.name}
                {role.is_system && <SystemBadge />}
              </span>
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      )}
      <AlertModalCore
        isOpen={pendingRoleId !== null}
        handleClose={() => setPendingRoleId(null)}
        handleSubmit={handleConfirmRoleChange}
        isSubmitting={isConfirmingRoleChange}
        variant="primary"
        title={t("workspace_settings.settings.members.columns.scim_confirm_title")}
        content={t("workspace_settings.settings.members.columns.scim_confirm_content", {
          name: rowData.member.display_name || rowData.member.email,
        })}
        primaryButtonText={{
          loading: t("workspace_settings.settings.members.columns.scim_confirm_loading"),
          default: t("workspace_settings.settings.members.columns.scim_confirm_default"),
        }}
      />
    </>
  );
});
