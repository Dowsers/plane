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
import type { IMilestone } from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { useMilestone } from "@/hooks/store/use-milestone";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateMilestoneModal } from "./create-update-modal";

type Props = {
  milestone: IMilestone;
  onDeleted?: () => void;
};

export const MilestoneQuickActions = observer(function MilestoneQuickActions(props: Props) {
  const { milestone, onDeleted } = props;
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { deleteMilestone } = useMilestone();
  const { allowPermissions } = useUserPermissions();

  const [updateModal, setUpdateModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canModify = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  const handleDelete = async () => {
    if (!workspaceSlug || !projectId) return;
    setIsDeleting(true);
    try {
      await deleteMilestone(workspaceSlug.toString(), projectId.toString(), milestone.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("milestones.toast.delete_success") });
      setDeleteModal(false);
      onDeleted?.();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("milestones.toast.error") });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canModify) return null;

  return (
    <>
      <CreateUpdateMilestoneModal
        isOpen={updateModal}
        handleClose={() => setUpdateModal(false)}
        milestone={milestone}
      />
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("milestones.delete_confirm.title")}
        content={t("milestones.delete_confirm.description")}
      />
      <CustomMenu
        customButton={<IconButton variant="tertiary" size="lg" icon={MoreHorizontal} />}
        placement="bottom-end"
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={() => setUpdateModal(true)} className="flex items-center gap-2">
          <Pencil className="h-3 w-3" />
          {t("edit")}
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem
          onClick={() => setDeleteModal(true)}
          className="flex items-center gap-2 text-danger-primary"
        >
          <Trash2 className="h-3 w-3" />
          {t("delete")}
        </CustomMenu.MenuItem>
      </CustomMenu>
    </>
  );
});
