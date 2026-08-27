/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { getPageName } from "@plane/utils";
// hooks
import { usePageTemplate } from "@/hooks/store/use-page-template";
// store types
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  page: TPageInstance;
};

// Category 14, feature 14c, section 2 ("Enregistrer une Page existante comme
// template") - lightweight confirmation modal (exigence 2), name pre-filled
// with `f"{page.name} Template"` (mirrors ProjectTemplateViewSet.create's
// own default for `source_project_id`) but editable before submit.
export const SaveAsTemplateModal = observer(function SaveAsTemplateModal(props: Props) {
  const { isOpen, onClose, page } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { saveAsTemplate } = usePageTemplate();

  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(`${getPageName(page.name)} Template`);
    }
  }, [isOpen, page.name]);

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = async () => {
    if (!workspaceSlug || !page.id || !name.trim()) return;
    setIsSubmitting(true);
    try {
      await saveAsTemplate(workspaceSlug.toString(), page.id, { name: name.trim() });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("page_templates.toast.save_success"),
      });
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.name || error?.error || t("page_templates.toast.error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className="space-y-3 p-5">
          <h3 className="text-18 font-medium text-secondary">{t("page_templates.save_modal.title")}</h3>
          <p className="text-13 text-secondary">{t("page_templates.save_modal.description")}</p>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("page_templates.name")}
            className="w-full resize-none text-14"
            required
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={!name.trim()}>
            {t("page_templates.save_modal.submit")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
