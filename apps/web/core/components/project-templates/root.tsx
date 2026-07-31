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
import { Loader } from "@plane/ui";
// hooks
import { useProjectTemplate } from "@/hooks/store/use-project-template";
// local imports
import { ProjectTemplateCard } from "./template-card";

export const ProjectTemplatesListRoot = observer(function ProjectTemplatesListRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTemplateIds, getTemplateById, fetchTemplates } = useProjectTemplate();

  const { isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_PROJECT_TEMPLATES", workspaceSlug] : null,
    workspaceSlug ? () => fetchTemplates(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const templateIds = workspaceSlug ? getTemplateIds(workspaceSlug.toString()) : null;

  if (isLoading && !templateIds) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="80px" />
        <Loader.Item height="80px" />
      </Loader>
    );
  }

  if (!templateIds || templateIds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <h3 className="text-14 font-medium">{t("project_templates.empty_state.title")}</h3>
        <p className="max-w-md text-13 text-secondary">{t("project_templates.empty_state.description")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {templateIds.map((templateId) => {
        const template = getTemplateById(templateId);
        if (!template) return null;
        return <ProjectTemplateCard key={templateId} template={template} />;
      })}
    </div>
  );
});
