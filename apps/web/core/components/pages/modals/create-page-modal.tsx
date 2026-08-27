/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// constants
import type { EPageAccess } from "@plane/constants";
import type { IPageTemplateListItem, TPage } from "@plane/types";
// ui
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { usePageTemplate } from "@/hooks/store/use-page-template";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web components
import { PageTemplateGalleryModal } from "@/components/page-templates/gallery-modal";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { usePageStore } from "@/plane-web/hooks/store";
// local imports
import { PageForm } from "./page-form";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isModalOpen: boolean;
  pageAccess?: EPageAccess;
  handleModalClose: () => void;
  redirectionEnabled?: boolean;
  storeType: EPageStoreType;
};

// Category 14, feature 14c, section 3 ("Galerie de selection a la creation
// d'une Page") - the gallery step (exigence 1) is shown first, before the
// existing PageForm. Picking "Blank page" (or there simply being nothing to
// show a gallery for) drops straight into the pre-existing PageForm flow,
// unchanged. Picking a real PageTemplate also goes through PageForm (so the
// name stays editable per exigence 2), but pre-filled with the template's
// name, and submission is routed to the dedicated `create-page/` endpoint
// (`usePageTemplate().createPageFromTemplate`) instead of the plain
// `createPage` store action, so `PageTemplate.usage_count` increments
// atomically server-side (exigence 5).
export function CreatePageModal(props: Props) {
  const {
    workspaceSlug,
    projectId,
    isModalOpen,
    pageAccess,
    handleModalClose,
    redirectionEnabled = false,
    storeType,
  } = props;
  // states
  const [pageFormData, setPageFormData] = useState<Partial<TPage>>({
    id: undefined,
    name: "",
    logo_props: undefined,
  });
  const [isGalleryOpen, setIsGalleryOpen] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<IPageTemplateListItem | undefined>(undefined);
  // router
  const router = useAppRouter();
  // store hooks
  const { createPage } = usePageStore(storeType);
  const { createPageFromTemplate } = usePageTemplate();
  const handlePageFormData = <T extends keyof TPage>(key: T, value: TPage[T]) =>
    setPageFormData((prev) => ({ ...prev, [key]: value }));

  // update page access in form data when page access from the store changes
  useEffect(() => {
    setPageFormData((prev) => ({ ...prev, access: pageAccess }));
  }, [pageAccess]);

  // Category 14, feature 14c - exigence 6: no PageTemplate yet, or the
  // gallery having already been dismissed once for this modal lifecycle,
  // both fall back to the exact pre-existing (galleryless) flow.
  useEffect(() => {
    if (isModalOpen) {
      setIsGalleryOpen(true);
      setSelectedTemplate(undefined);
    }
  }, [isModalOpen]);

  const handleStateClear = () => {
    setPageFormData({ id: undefined, name: "", access: pageAccess });
    setSelectedTemplate(undefined);
    setIsGalleryOpen(true);
    handleModalClose();
  };

  const handleSelectBlank = () => {
    setSelectedTemplate(undefined);
    setIsGalleryOpen(false);
  };

  const handleSelectTemplate = (template: IPageTemplateListItem) => {
    setSelectedTemplate(template);
    setPageFormData((prev) => ({ ...prev, name: template.name }));
    setIsGalleryOpen(false);
  };

  const handleFormSubmit = async () => {
    if (!workspaceSlug || !projectId) return;

    try {
      const pageData = selectedTemplate
        ? await createPageFromTemplate(workspaceSlug, selectedTemplate.id, {
            name: pageFormData.name || selectedTemplate.name,
            project_id: projectId,
          })
        : await createPage(pageFormData);
      if (pageData) {
        handleStateClear();
        if (redirectionEnabled) router.push(`/${workspaceSlug}/projects/${projectId}/pages/${pageData.id}`);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
      <PageTemplateGalleryModal
        isOpen={isModalOpen && isGalleryOpen}
        handleClose={handleStateClear}
        onSelectBlank={handleSelectBlank}
        onSelectTemplate={handleSelectTemplate}
      />
      <ModalCore
        isOpen={isModalOpen && !isGalleryOpen}
        handleClose={handleStateClear}
        position={EModalPosition.TOP}
        width={EModalWidth.XXL}
      >
        <PageForm
          formData={pageFormData}
          handleFormData={handlePageFormData}
          handleModalClose={handleStateClear}
          handleFormSubmit={handleFormSubmit}
        />
      </ModalCore>
    </>
  );
}
