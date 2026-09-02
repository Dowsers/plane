/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// components
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  page: TPageInstance;
};

/**
 * Category 10, feature 4 ("Wiki workspace en GA") exigence 5 - "Deplacer
 * vers un projet", the Wiki-side of the project<->Wiki conversion action.
 * Symmetric to the project-side "Deplacer vers le Wiki" action (see
 * `usePageConvertOperations`), which needs no target picker since a Wiki
 * page has exactly one possible destination scope.
 */
export const MoveToProjectModal = observer(function MoveToProjectModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, page } = props;
  // states
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // router
  const router = useAppRouter();
  // store hooks
  const { convertToProject } = usePageStore(EPageStoreType.WORKSPACE);
  const { t } = useTranslation();

  const handleClose = () => {
    setProjectId(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!page.id || !projectId) return;
    setIsSubmitting(true);
    try {
      await convertToProject(workspaceSlug, page.id, projectId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("wiki.toast.convert_to_project_success"),
      });
      handleClose();
      router.push(`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error || t("wiki.toast.convert_error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="space-y-4 p-5">
        <h3 className="text-18 font-medium text-secondary">{t("wiki.move_to_project")}</h3>
        <p className="text-13 text-secondary">{t("wiki.move_to_project_description")}</p>
        <ProjectDropdown
          buttonVariant="border-with-text"
          multiple={false}
          value={projectId}
          onChange={(val: string) => setProjectId(val)}
          placeholder={t("wiki.move_to_project_modal.select_project_placeholder")}
          className="w-full"
          buttonClassName="w-full"
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" size="lg" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="lg" loading={isSubmitting} disabled={!projectId} onClick={handleSubmit}>
          {t("wiki.move_to_project_modal.move_button")}
        </Button>
      </div>
    </ModalCore>
  );
});
