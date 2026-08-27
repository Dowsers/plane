/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPageTemplateListItem } from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { usePageTemplate } from "@/hooks/store/use-page-template";

type Props = {
  template: IPageTemplateListItem;
};

export const PageTemplateQuickActions = observer(function PageTemplateQuickActions(props: Props) {
  const { template } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { duplicateTemplate, deleteTemplate } = usePageTemplate();

  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const handleDuplicate = async () => {
    if (!workspaceSlug) return;
    setIsDuplicating(true);
    try {
      await duplicateTemplate(workspaceSlug.toString(), template.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("page_templates.toast.duplicate_success"),
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("page_templates.toast.error") });
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async () => {
    if (!workspaceSlug) return;
    setIsDeleting(true);
    try {
      await deleteTemplate(workspaceSlug.toString(), template.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("page_templates.toast.delete_success"),
      });
      setDeleteModal(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("page_templates.toast.error") });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("page_templates.delete_confirm.title")}
        content={t("page_templates.delete_confirm.description")}
      />
      <CustomMenu
        customButton={<IconButton variant="tertiary" size="lg" icon={MoreHorizontal} />}
        placement="bottom-end"
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={handleDuplicate} disabled={isDuplicating} className="flex items-center gap-2">
          <Copy className="h-3 w-3" />
          {t("common.duplicate")}
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
