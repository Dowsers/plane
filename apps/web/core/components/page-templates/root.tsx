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
import { usePageTemplate } from "@/hooks/store/use-page-template";
// local imports
import { PageTemplateCard } from "./template-card";

export const PageTemplatesListRoot = observer(function PageTemplatesListRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTemplateIds, getTemplateById, fetchTemplates } = usePageTemplate();

  const { isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_PAGE_TEMPLATES", workspaceSlug] : null,
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
        <h3 className="text-14 font-medium">{t("page_templates.empty_state.title")}</h3>
        <p className="max-w-md text-13 text-secondary">{t("page_templates.empty_state.description")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {templateIds.map((templateId) => {
        const template = getTemplateById(templateId);
        if (!template) return null;
        return <PageTemplateCard key={templateId} template={template} />;
      })}
    </div>
  );
});
