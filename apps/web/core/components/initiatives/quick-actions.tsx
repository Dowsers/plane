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
import type { IInitiative } from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { useInitiative } from "@/hooks/store/use-initiative";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateInitiativeModal } from "./create-update-modal";

type Props = {
  initiative: IInitiative;
  onDeleted?: () => void;
};

export const InitiativeQuickActions = observer(function InitiativeQuickActions(props: Props) {
  const { initiative, onDeleted } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { deleteInitiative } = useInitiative();
  const { allowPermissions } = useUserPermissions();

  const [updateModal, setUpdateModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const isLead = !!initiative.lead_id;
  const canModify = isWorkspaceAdmin || isLead;

  const handleDelete = async () => {
    if (!workspaceSlug) return;
    setIsDeleting(true);
    try {
      await deleteInitiative(workspaceSlug.toString(), initiative.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("initiatives.toast.delete_success") });
      setDeleteModal(false);
      onDeleted?.();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("initiatives.toast.error") });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <CreateUpdateInitiativeModal
        isOpen={updateModal}
        handleClose={() => setUpdateModal(false)}
        initiative={initiative}
      />
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("initiatives.delete_confirm.title")}
        content={t("initiatives.delete_confirm.description")}
      />
      <CustomMenu
        customButton={<IconButton variant="tertiary" size="lg" icon={MoreHorizontal} />}
        placement="bottom-end"
        closeOnSelect
      >
        <CustomMenu.MenuItem
          onClick={() => setUpdateModal(true)}
          disabled={!canModify}
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
