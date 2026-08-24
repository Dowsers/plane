/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";

import { Disclosure } from "@headlessui/react";
import { Crown } from "lucide-react";
// plane imports
import { ROLE, EUserPermissions, EUserPermissionsLevel, MEMBER_TRACKER_ELEMENTS } from "@plane/constants";
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
}

type NameProps = {
  rowData: RowData;
  workspaceSlug: string;
  isAdmin: boolean;
  currentUser: IUser | undefined;
  setRemoveMemberModal: (rowData: RowData) => void;
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
  const { rowData, workspaceSlug, isAdmin, currentUser, setRemoveMemberModal, setTransferOwnershipModal } = props;
  // derived values
  const { avatar_url, display_name, email, first_name, id, last_name } = rowData.member;
  const isSuspended = rowData.is_active === false;
  const isCurrentUser = id === currentUser?.id;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 5 - "Transfer ownership" is only ever offered
  // on the current Owner's own row.
  const canTransferOwnership = isCurrentUser && rowData.is_owner && Boolean(setTransferOwnershipModal);
  const menuItems: Array<"transfer" | "remove"> = [...(canTransferOwnership ? (["transfer"] as const) : []), "remove"];

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
                <Tooltip tooltipContent="Workspace Owner">
                  <Crown className="size-3.5 shrink-0 text-warning-primary" aria-label="Workspace Owner" />
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
                      <Crown className="size-3.5 align-middle" /> Transfer ownership
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-x-3"
                      onClick={() => setRemoveMemberModal(rowData)}
                      data-ph-element={MEMBER_TRACKER_ELEMENTS.WORKSPACE_MEMBER_TABLE_CONTEXT_MENU}
                    >
                      <TrashIcon className="size-3.5 align-middle" /> {isCurrentUser ? "Leave " : "Remove "}
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
  // form info
  const {
    control,
    formState: { errors },
  } = useForm();
  // state
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 2 ("SCIM 2.0 natif") - the spec's own UX note
  // ("avertissement si un Admin tente de modifier manuellement le role...
  // d'un membre scim_managed=True") - a SOFT warning only, the backend
  // never blocks this (`WorkspaceMemberAdminSerializer`'s own PATCH has no
  // such check), so a role change on a SCIM-managed row is held behind one
  // extra confirmation step instead of applying immediately like every
  // other row.
  const [pendingRole, setPendingRole] = useState<EUserPermissions | null>(null);
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

  const applyRoleChange = async (value: EUserPermissions) => {
    if (!workspaceSlug) return;
    try {
      await updateMember(workspaceSlug.toString(), rowData.member.id, {
        role: value as unknown as EUserPermissions,
      });
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

  const handleRoleChange = async (value: EUserPermissions) => {
    if (rowData.scim_managed) {
      setPendingRole(value);
      return;
    }
    await applyRoleChange(value);
  };

  const handleConfirmRoleChange = async () => {
    if (pendingRole === null) return;
    setIsConfirmingRoleChange(true);
    await applyRoleChange(pendingRole);
    setIsConfirmingRoleChange(false);
    setPendingRole(null);
  };

  return (
    <>
      {isSuspended ? (
        <div className="flex w-32">
          <Pill variant={EPillVariant.DEFAULT} size={EPillSize.SM} className="border-none">
            Suspended
          </Pill>
        </div>
      ) : isRoleNonEditable ? (
        <div className="flex w-32">
          <span>{ROLE[rowData.role]}</span>
        </div>
      ) : (
        <Controller
          name="role"
          control={control}
          rules={{ required: "Role is required." }}
          render={({ field: { value: selectedRole } }) => (
            <CustomSelect
              value={selectedRole as EUserPermissions}
              onChange={(value: EUserPermissions) => {
                void handleRoleChange(value);
              }}
              label={
                <div className="flex">
                  <span>{ROLE[rowData.role]}</span>
                </div>
              }
              buttonClassName={`!px-0 !justify-start hover:bg-surface-1 ${errors.role ? "border-danger-strong" : "border-none"}`}
              className="w-32 rounded-md p-0"
              input
            >
              {Object.keys(ROLE).map((item) => (
                <CustomSelect.Option key={item} value={item as unknown as EUserPermissions}>
                  {ROLE[item as unknown as keyof typeof ROLE]}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          )}
        />
      )}
      <AlertModalCore
        isOpen={pendingRole !== null}
        handleClose={() => setPendingRole(null)}
        handleSubmit={handleConfirmRoleChange}
        isSubmitting={isConfirmingRoleChange}
        variant="primary"
        title="Change role of a SCIM-managed member?"
        content={
          <>
            {rowData.member.display_name || rowData.member.email}&apos;s role is managed by your SCIM identity provider.
            Changing it here only affects Plane - your IdP is not aware of this change and may overwrite it on the next
            sync.
          </>
        }
        primaryButtonText={{ loading: "Changing", default: "Change role anyway" }}
      />
    </>
  );
});
