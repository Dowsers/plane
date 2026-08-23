/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
import { Crown } from "lucide-react";
// plane imports
import { EUserPermissions } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspace } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useMember } from "@/hooks/store/use-member";

type Props = {
  isOpen: boolean;
  workspace: IWorkspace | null;
  onClose: () => void;
};

const defaultValues = {
  newOwnerId: null as string | null,
  workspaceName: "",
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 5, exigence 3/4 - "Transfer ownership"
 * confirmation modal. Follows the same "type the workspace name to
 * confirm" pattern this fork already uses for workspace deletion
 * (`DeleteWorkspaceForm`, apps/web/core/components/workspace/
 * delete-workspace-form.tsx) rather than a password/OTP re-entry - this
 * fork has no "confirm with password" UI primitive anywhere else
 * (checked), and the explicit-typed-confirmation pattern is already the
 * established precedent for irreversible/sensitive workspace-level
 * actions, so reusing it here keeps the two most sensitive workspace
 * actions consistent rather than introducing a third, novel pattern.
 */
export const TransferOwnershipModal = observer(function TransferOwnershipModal(props: Props) {
  const { isOpen, workspace, onClose } = props;
  // store hooks
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails, transferOwnership },
  } = useMember();
  // form
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
    watch,
  } = useForm({ defaultValues });

  const newOwnerId = watch("newOwnerId");
  const canTransfer = Boolean(newOwnerId) && watch("workspaceName") === workspace?.name;

  // Eligible targets - active Admins only (the backend rejects anything
  // else with a 400 anyway, but narrowing the dropdown avoids a
  // guaranteed-to-fail round trip and matches exigence 3's own wording).
  const eligibleAdminIds = (workspaceMemberIds ?? []).filter((memberId) => {
    const details = getWorkspaceMemberDetails(memberId);
    return details?.role === EUserPermissions.ADMIN && details?.is_active !== false && !details?.is_owner;
  });

  const handleClose = () => {
    const timer = setTimeout(() => {
      reset(defaultValues);
      clearTimeout(timer);
    }, 350);
    onClose();
  };

  const onSubmit = async () => {
    if (!workspace || !newOwnerId || !canTransfer) return;
    try {
      await transferOwnership(workspace.slug, newOwnerId);
      handleClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Ownership transferred",
        message: "Workspace ownership has been transferred successfully.",
      });
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.error ?? "Something went wrong while transferring ownership. Please try again.",
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full bg-warning-subtle text-warning-primary sm:size-10"
            )}
          >
            <Crown className="size-5 text-warning-primary" aria-hidden="true" />
          </span>
          <div className="w-full">
            <div className="text-center sm:text-left">
              <h3 className="text-h5-medium">Transfer workspace ownership</h3>
              <p className="mt-1 text-body-xs-regular text-secondary">
                You are about to transfer ownership of <span className="text-body-xs-semibold">{workspace?.name}</span>.
                You will remain an Admin, but you will lose access to Security settings and the audit log. This action
                cannot be undone by you alone.
              </p>
            </div>

            <div className="mt-4 text-secondary">
              <p className="text-body-xs-regular">New owner</p>
              <Controller
                control={control}
                name="newOwnerId"
                render={({ field: { value, onChange } }) => (
                  <MemberDropdown
                    memberIds={eligibleAdminIds}
                    multiple={false}
                    value={value}
                    onChange={onChange}
                    placeholder="Select an Admin"
                    buttonVariant="border-with-text"
                    buttonContainerClassName="mt-2 w-full"
                    showUserDetails
                  />
                )}
              />
              {eligibleAdminIds.length === 0 && (
                <p className="mt-1 text-caption-sm-regular text-danger-primary">
                  No other active Admin is available to receive ownership.
                </p>
              )}
            </div>

            <div className="mt-4 text-secondary">
              <p className="text-body-xs-regular break-words">Type in this workspace&apos;s name to confirm.</p>
              <Controller
                control={control}
                name="workspaceName"
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id="workspaceName"
                    name="workspaceName"
                    type="text"
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    placeholder={workspace?.name}
                    className="mt-2 w-full"
                    autoComplete="off"
                  />
                )}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" size="lg" type="submit" disabled={!canTransfer} loading={isSubmitting}>
            {isSubmitting ? "Transferring..." : "Transfer ownership"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
