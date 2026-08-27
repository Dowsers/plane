/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import type { IPageTemplateListItem } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
// hooks
import { usePageTemplate } from "@/hooks/store/use-page-template";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  onSelectBlank: () => void;
  onSelectTemplate: (template: IPageTemplateListItem) => void;
};

// Category 14, feature 14c, section 3 ("Galerie de selection a la creation
// d'une Page") - direct equivalent of ProjectTemplateGalleryModal
// (components/project-templates/gallery-modal.tsx), parameterized for
// PageTemplate instead. The "Blank page" card is always rendered first
// (exigence 1) regardless of how many real templates exist.
export const PageTemplateGalleryModal = observer(function PageTemplateGalleryModal(props: Props) {
  const { isOpen, handleClose, onSelectBlank, onSelectTemplate } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTemplateIds, getTemplateById, fetchTemplates } = usePageTemplate();

  const { isLoading } = useSWR(
    isOpen && workspaceSlug ? ["WORKSPACE_PAGE_TEMPLATES", workspaceSlug] : null,
    isOpen && workspaceSlug ? () => fetchTemplates(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const templateIds = workspaceSlug ? getTemplateIds(workspaceSlug.toString()) : null;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-3 p-5">
        <h3 className="text-16 font-medium">{t("page_templates.start_from_template")}</h3>
        {isLoading && !templateIds ? (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        ) : (
          <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            <button
              type="button"
              onClick={onSelectBlank}
              className="flex flex-col gap-1 rounded-md border-[0.5px] border-subtle p-3 text-left hover:bg-layer-1"
            >
              <div className="flex items-center gap-2">
                <PageIcon className="h-4 w-4 text-tertiary" />
                <span className="truncate text-13 font-medium">{t("page_templates.start_from_scratch")}</span>
              </div>
            </button>
            {(templateIds ?? []).map((templateId) => {
              const template = getTemplateById(templateId);
              if (!template) return null;
              return (
                <button
                  key={templateId}
                  type="button"
                  onClick={() => onSelectTemplate(template)}
                  className="flex flex-col gap-1 rounded-md border-[0.5px] border-subtle p-3 text-left hover:bg-layer-1"
                >
                  <div className="flex items-center gap-2">
                    <Logo logo={template.logo_props} size={16} />
                    <span className="truncate text-13 font-medium">{template.name}</span>
                  </div>
                  <span className="text-11 text-placeholder">
                    {t("page_templates.usage_count", { count: template.usage_count })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ModalCore>
  );
});
