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
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateTeamspaceModal } from "./create-update-modal";

type Props = {
  teamspace: ITeamspace;
  onDeleted?: () => void;
};

export const TeamspaceQuickActions = observer(function TeamspaceQuickActions(props: Props) {
  const { teamspace, onDeleted } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { deleteTeamspace } = useTeamspace();
  const { allowPermissions } = useUserPermissions();

  const [updateModal, setUpdateModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

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
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("teamspaces.delete_confirm.title")}
        content={t("teamspaces.delete_confirm.description")}
      />
      <CustomMenu
        customButton={<IconButton variant="tertiary" size="lg" icon={MoreHorizontal} />}
        placement="bottom-end"
        closeOnSelect
      >
        <CustomMenu.MenuItem
          onClick={() => setUpdateModal(true)}
          disabled={!isWorkspaceAdmin}
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
