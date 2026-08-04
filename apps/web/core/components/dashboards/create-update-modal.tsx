/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDashboard } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  dashboard: TDashboard | null;
  /** When creating (no `dashboard`), navigates to the new dashboard's
   * editor on success. */
  navigateOnCreate?: boolean;
};

const DEFAULTS = { name: "", description: "" };

export const CreateUpdateDashboardModal = observer(function CreateUpdateDashboardModal(props: Props) {
  const { isOpen, handleClose, dashboard, navigateOnCreate = true } = props;
  const { workspaceSlug } = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { createDashboard, updateDashboard } = useCustomDashboard();

  const [values, setValues] = useState(DEFAULTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setValues(dashboard ? { name: dashboard.name, description: dashboard.description } : DEFAULTS);
  }, [dashboard, isOpen]);

  const onClose = () => {
    handleClose();
    setValues(DEFAULTS);
  };

  const handleSubmit = async () => {
    if (!workspaceSlug || !values.name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("workspace_dashboards.name_placeholder"),
      });
      return;
    }

    const payload = { name: values.name.trim(), description: values.description ?? "" };

    setIsSubmitting(true);
    try {
      if (dashboard) {
        await updateDashboard(workspaceSlug.toString(), dashboard.id, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("workspace_dashboards.toast.update_success"),
        });
      } else {
        const created = await createDashboard(workspaceSlug.toString(), payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("workspace_dashboards.toast.create_success"),
        });
        if (navigateOnCreate) router.push(`/${workspaceSlug}/dashboards/${created.id}/`);
      }
      onClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("workspace_dashboards.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">
          {dashboard ? t("workspace_dashboards.update_dashboard") : t("workspace_dashboards.create_dashboard")}
        </h3>
        <Input
          type="text"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          placeholder={t("workspace_dashboards.name_placeholder")}
          className="w-full"
        />
        <TextArea
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          placeholder={t("workspace_dashboards.description_placeholder")}
          className="w-full"
          rows={3}
        />
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {dashboard ? t("update") : t("common.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
