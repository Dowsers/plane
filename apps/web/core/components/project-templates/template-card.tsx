/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { IProjectTemplateListItem } from "@plane/types";
// local imports
import { ProjectTemplateQuickActions } from "./quick-actions";

type Props = {
  template: IProjectTemplateListItem;
};

export const ProjectTemplateCard = observer(function ProjectTemplateCard(props: Props) {
  const { template } = props;
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          <Logo logo={template.logo_props} size={18} />
          <span className="truncate text-14 font-medium">{template.name}</span>
        </div>
        <ProjectTemplateQuickActions template={template} />
      </div>

      {template.description && <p className="line-clamp-2 text-13 text-secondary">{template.description}</p>}

      <div className="flex flex-wrap items-center gap-3 text-11 text-secondary">
        <span>{t("project_templates.states_count", { count: template.total_states })}</span>
        <span>{t("project_templates.labels_count", { count: template.total_labels })}</span>
        <span>{t("project_templates.issues_count", { count: template.total_issues })}</span>
      </div>

      <span className="text-11 text-placeholder">
        {t("project_templates.usage_count", { count: template.usage_count })}
      </span>
    </div>
  );
});
