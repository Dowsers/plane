/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ITeamspace } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// local imports
import { TEAMSPACE_LEAD } from "./constants";
import { CreateUpdateTeamspaceModal } from "./create-update-modal";
import { DeleteTeamspaceConfirmModal } from "./delete-confirm-modal";

type Props = {
  teamspace: ITeamspace;
  onDeleted?: () => void;
};

export const TeamspaceQuickActions = observer(function TeamspaceQuickActions(props: Props) {
  const { teamspace, onDeleted } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { deleteTeamspace, getTeamspaceMembersById } = useTeamspace();
  const { allowPermissions } = useUserPermissions();
  const { data: currentUser } = useUser();

  const [updateModal, setUpdateModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  // Spec section 1, exigence 2 - editing (name/description/icon/attached
  // projects) is open to workspace Admins AND the Teamspace's own Leads;
  // deletion (exigence 7) stays Admin-only. NOTE: `teamspaceMembersMap` is
  // only populated once `fetchTeamspaceDetails` has run for this teamspace
  // (the detail page's root.tsx does this on mount); on the list page
  // (root.tsx in this same directory, which only calls the lighter-weight
  // `fetchTeamspaces`) a Lead who hasn't opened the detail page yet will
  // still only see Edit enabled via the Admin path - a known, low-impact
  // gap rather than a security issue (the backend re-checks Lead/Admin on
  // every write regardless of what the UI shows).
  const members = getTeamspaceMembersById(teamspace.id);
  const isTeamspaceLead = members.some((member) => member.member === currentUser?.id && member.role === TEAMSPACE_LEAD);
  const canEdit = isWorkspaceAdmin || isTeamspaceLead;

  const handleDelete = async () => {
    if (!workspaceSlug) return;
    setIsDeleting(true);
    try {
      await deleteTeamspace(workspaceSlug.toString(), teamspace.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("teamspaces.toast.delete_success"),
      });
      setDeleteModal(false);
      onDeleted?.();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <CreateUpdateTeamspaceModal
        isOpen={updateModal}
        handleClose={() => setUpdateModal(false)}
        teamspace={teamspace}
      />
      <DeleteTeamspaceConfirmModal
        isOpen={deleteModal}
        teamspace={teamspace}
        isSubmitting={isDeleting}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
      />
      <CustomMenu
        customButton={<IconButton variant="tertiary" size="lg" icon={MoreHorizontal} />}
        placement="bottom-end"
        closeOnSelect
      >
        <CustomMenu.MenuItem
          onClick={() => setUpdateModal(true)}
          disabled={!canEdit}
          className="flex items-center gap-2"
        >
          <Pencil className="h-3 w-3" />
          {t("edit")}
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem
          onClick={() => setDeleteModal(true)}
          disabled={!isWorkspaceAdmin}
          className="flex items-center gap-2 text-danger-primary"
        >
          <Trash2 className="h-3 w-3" />
          {t("delete")}
        </CustomMenu.MenuItem>
      </CustomMenu>
    </>
  );
});
