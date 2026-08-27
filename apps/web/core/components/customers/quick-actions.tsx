/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICustomer } from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateCustomerModal } from "./create-update-modal";

type Props = {
  customer: ICustomer;
  onDeleted?: () => void;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 1, exigence 5) in plane-selfhost - mirrors
 * `TeamspaceQuickActions`. Edit is gated Admin+Member, delete is Admin-only
 * (a stricter gate than Teamspace's own Lead-or-Admin edit rule, matching
 * this feature's own, more open, WORKSPACE-level permission model).
 */
export const CustomerQuickActions = observer(function CustomerQuickActions(props: Props) {
  const { customer, onDeleted } = props;
  const { workspaceSlug } = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { deleteCustomer } = useCustomer();
  const { allowPermissions } = useUserPermissions();

  const [updateModal, setUpdateModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canEdit = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.WORKSPACE);
  const canDelete = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const handleDelete = async () => {
    if (!workspaceSlug) return;
    setIsDeleting(true);
    try {
      await deleteCustomer(workspaceSlug.toString(), customer.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("customers.toast.delete_success") });
      setDeleteModal(false);
      onDeleted?.();
      router.push(`/${workspaceSlug}/customers/`);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.toast.error") });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <CreateUpdateCustomerModal isOpen={updateModal} handleClose={() => setUpdateModal(false)} customer={customer} />
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("customers.delete_confirm.title")}
        content={t("customers.delete_confirm.description")}
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
          disabled={!canDelete}
          className="flex items-center gap-2 text-danger-primary"
        >
          <Trash2 className="h-3 w-3" />
          {t("delete")}
        </CustomMenu.MenuItem>
      </CustomMenu>
    </>
  );
});
