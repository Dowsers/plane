/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkspaceRole } from "@plane/types";
import { AlertModalCore, CustomSelect, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import { WorkspaceService } from "@/services/workspace.service";
import workspaceRBACService from "@/services/workspace-rbac.service";

type Props = {
  workspaceSlug: string;
  role: TWorkspaceRole;
  allRoles: TWorkspaceRole[] | undefined;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

const workspaceService = new WorkspaceService();

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4, exigence 7 - deleting a role in use is
 * blocked (400 + `member_count`) unless every member holding it is first
 * reassigned elsewhere - "pas de suppression en cascade silencieuse des
 * membres". Fetches the REAL affected members (`GET .../roles/<id>/members/`)
 * up front rather than trial-and-error-ing the delete call, so the
 * reassignment picker (when needed) never has to make a second round trip.
 */
export function DeleteRoleModal(props: Props) {
  const { workspaceSlug, role, allRoles, isOpen, onClose, onDeleted } = props;
  const [reassignToRoleId, setReassignToRoleId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Refreshing the MobX-backed Members tab's own store after a bulk
  // reassignment below (the mutation itself goes straight through the
  // plain `WorkspaceService`, not this store, so a member's row there
  // would otherwise show a stale role label until the next unrelated
  // refetch).
  const {
    workspace: { fetchWorkspaceMembers },
  } = useMember();

  const { data: members, isLoading } = useSWR(isOpen ? ["RBAC_ROLE_MEMBERS", workspaceSlug, role.id] : null, () =>
    workspaceRBACService.getRoleMembers(workspaceSlug, role.id)
  );

  const reassignmentCandidates = (allRoles ?? []).filter((candidate) => candidate.id !== role.id);

  useEffect(() => {
    if (isOpen) setReassignToRoleId(reassignmentCandidates[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, role.id]);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await workspaceRBACService.deleteRole(workspaceSlug, role.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Role deleted", message: `"${role.name}" was deleted.` });
      onDeleted();
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not delete role",
        message: err?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReassignAndDelete = async () => {
    if (!reassignToRoleId || !members) return;
    setIsSubmitting(true);
    try {
      await Promise.all(
        members.map((member) =>
          workspaceService.updateWorkspaceMember(workspaceSlug, member.id, { custom_role_id: reassignToRoleId })
        )
      );
      await workspaceRBACService.deleteRole(workspaceSlug, role.id);
      await fetchWorkspaceMembers(workspaceSlug);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Role deleted",
        message: `${members.length} member(s) were reassigned and "${role.name}" was deleted.`,
      });
      onDeleted();
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not reassign and delete",
        message: err?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || members === undefined) {
    return (
      <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
        <Loader className="flex flex-col gap-3 p-6">
          <Loader.Item height="24px" />
          <Loader.Item height="64px" />
        </Loader>
      </ModalCore>
    );
  }

  if (members.length === 0) {
    return (
      <AlertModalCore
        isOpen={isOpen}
        handleClose={onClose}
        handleSubmit={handleDelete}
        isSubmitting={isSubmitting}
        variant="danger"
        title="Delete this role?"
        content={<>No member currently holds &quot;{role.name}&quot; - this cannot be undone.</>}
        primaryButtonText={{ loading: "Deleting", default: "Delete role" }}
      />
    );
  }

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h3 className="text-h5-medium">Reassign members before deleting</h3>
          <p className="mt-1 text-body-xs-regular text-secondary">
            {members.length} member(s) currently hold &quot;{role.name}&quot;. Choose a role to move all of them to
            before this role can be deleted - there is no silent removal.
          </p>
        </div>

        <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-md border border-subtle p-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-2 text-body-xs-regular text-secondary">
              {member.member.avatar_url ? (
                <img
                  src={getFileURL(member.member.avatar_url)}
                  alt={member.member.display_name}
                  className="size-5 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-5 items-center justify-center rounded-full bg-layer-3 text-caption-sm-regular">
                  {(member.member.email ?? member.member.display_name ?? "?")[0]}
                </span>
              )}
              {member.member.display_name || member.member.email}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">Reassign to</span>
          <CustomSelect
            value={reassignToRoleId ?? ""}
            onChange={(value: string) => setReassignToRoleId(value)}
            label={
              reassignmentCandidates.find((candidate) => candidate.id === reassignToRoleId)?.name ?? "Select a role"
            }
            buttonClassName="border border-subtle bg-layer-2 w-full"
          >
            {reassignmentCandidates.map((candidate) => (
              <CustomSelect.Option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="error-fill"
            size="lg"
            onClick={handleReassignAndDelete}
            disabled={!reassignToRoleId}
            loading={isSubmitting}
          >
            Reassign {members.length} member(s) &amp; delete
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
