/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LayoutTemplate, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";

export type TProjectTemplateSelect = {
  disabled?: boolean;
  onClick?: () => void;
  selectedTemplateName?: string | null;
  onClear?: () => void;
};

export function ProjectTemplateSelect(props: TProjectTemplateSelect) {
  const { disabled, onClick, selectedTemplateName, onClear } = props;
  const { t } = useTranslation();

  if (selectedTemplateName) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-surface-1/90 px-2 py-1 text-11 font-medium text-primary">
        <LayoutTemplate className="h-3 w-3 flex-shrink-0" />
        <span className="max-w-40 truncate">{selectedTemplateName}</span>
        {onClear && (
          <button type="button" onClick={onClear} disabled={disabled}>
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md bg-surface-1/90 px-2 py-1 text-11 font-medium text-primary hover:bg-surface-1"
    >
      <LayoutTemplate className="h-3 w-3 flex-shrink-0" />
      {t("project_templates.start_from_template")}
    </button>
  );
}
