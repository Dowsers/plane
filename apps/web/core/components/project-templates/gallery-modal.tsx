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
import type { IProjectTemplateListItem } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
// hooks
import { useProjectTemplate } from "@/hooks/store/use-project-template";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  onSelect: (template: IProjectTemplateListItem) => void;
};

export const ProjectTemplateGalleryModal = observer(function ProjectTemplateGalleryModal(props: Props) {
  const { isOpen, handleClose, onSelect } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTemplateIds, getTemplateById, fetchTemplates } = useProjectTemplate();

  const { isLoading } = useSWR(
    isOpen && workspaceSlug ? ["WORKSPACE_PROJECT_TEMPLATES", workspaceSlug] : null,
    isOpen && workspaceSlug ? () => fetchTemplates(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const templateIds = workspaceSlug ? getTemplateIds(workspaceSlug.toString()) : null;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-3 p-5">
        <h3 className="text-16 font-medium">{t("project_templates.start_from_template")}</h3>
        {isLoading && !templateIds ? (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        ) : !templateIds || templateIds.length === 0 ? (
          <p className="py-6 text-center text-13 text-secondary">{t("project_templates.empty_state.title")}</p>
        ) : (
          <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {templateIds.map((templateId) => {
              const template = getTemplateById(templateId);
              if (!template) return null;
              return (
                <button
                  key={templateId}
                  type="button"
                  onClick={() => onSelect(template)}
                  className="flex flex-col gap-1 rounded-md border-[0.5px] border-subtle p-3 text-left hover:bg-layer-1"
                >
                  <div className="flex items-center gap-2">
                    <Logo logo={template.logo_props} size={16} />
                    <span className="truncate text-13 font-medium">{template.name}</span>
                  </div>
                  {template.description && (
                    <p className="line-clamp-2 text-11 text-secondary">{template.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-11 text-placeholder">
                    <span>{t("project_templates.states_count", { count: template.total_states })}</span>
                    <span>{t("project_templates.labels_count", { count: template.total_labels })}</span>
                    <span>{t("project_templates.issues_count", { count: template.total_issues })}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ModalCore>
  );
});
