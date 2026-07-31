/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, Checkbox, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// hooks
import { useProjectTemplate } from "@/hooks/store/use-project-template";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  projectName: string;
};

export const SaveProjectAsTemplateModal = observer(function SaveProjectAsTemplateModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, projectName } = props;
  const { t } = useTranslation();
  const { createTemplateFromProject } = useProjectTemplate();

  const [name, setName] = useState(`${projectName} Template`);
  const [includeCurrentWorkItems, setIncludeCurrentWorkItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await createTemplateFromProject(workspaceSlug, {
        source_project_id: projectId,
        name: name.trim(),
        include_current_work_items: includeCurrentWorkItems,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("project_templates.toast.save_success"),
      });
      handleClose();
    } catch (error: any) {
      const message = error?.name?.[0] ?? t("project_templates.toast.error");
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{t("project_templates.save_as_template")}</h3>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("project_templates.name")}
          className="w-full"
        />
        <label htmlFor="include-current-work-items" className="flex items-start gap-2">
          <Checkbox
            id="include-current-work-items"
            checked={includeCurrentWorkItems}
            onChange={() => setIncludeCurrentWorkItems((v) => !v)}
          />
          <span className="flex flex-col">
            <span className="text-13">{t("project_templates.include_current_work_items")}</span>
            <span className="text-11 text-secondary">{t("project_templates.include_current_work_items_hint")}</span>
          </span>
        </label>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting} disabled={!name.trim()}>
            {t("project_templates.save_as_template")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
