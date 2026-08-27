/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { IPageTemplateListItem } from "@plane/types";
// local imports
import { PageTemplateQuickActions } from "./quick-actions";

type Props = {
  template: IPageTemplateListItem;
};

export const PageTemplateCard = observer(function PageTemplateCard(props: Props) {
  const { template } = props;
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          <Logo logo={template.logo_props} size={18} />
          <span className="truncate text-14 font-medium">{template.name}</span>
        </div>
        <PageTemplateQuickActions template={template} />
      </div>

      <span className="text-11 text-placeholder">
        {t("page_templates.usage_count", { count: template.usage_count })}
      </span>
    </div>
  );
});
