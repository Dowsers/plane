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
import type { TDashboard } from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateDashboardModal } from "./create-update-modal";

type Props = {
  dashboard: TDashboard;
};

export const DashboardQuickActions = observer(function DashboardQuickActions(props: Props) {
  const { dashboard } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { deleteDashboard } = useCustomDashboard();
  const { allowPermissions } = useUserPermissions();

  const [updateModal, setUpdateModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = dashboard.owned_by === currentUser?.id;
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canModify = isOwner || isAdmin;

  const handleDelete = async () => {
    if (!workspaceSlug) return;
    setIsDeleting(true);
    try {
      await deleteDashboard(workspaceSlug.toString(), dashboard.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("workspace_dashboards.toast.delete_success"),
      });
      setDeleteModal(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("workspace_dashboards.toast.error") });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canModify) return null;

  return (
    <>
      <CreateUpdateDashboardModal
        isOpen={updateModal}
        handleClose={() => setUpdateModal(false)}
        dashboard={dashboard}
      />
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("workspace_dashboards.delete_confirmation.title")}
        content={t("workspace_dashboards.delete_confirmation.description")}
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
