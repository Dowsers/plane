/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import { EViewAccess } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { VIEW_ACCESS_SPECIFIERS } from "@/helpers/views.helper";

type Props = {
  control: Control<any>;
};

// Public/Private toggle for project, workspace, and (in future) teamspace
// custom views - see docs/feature-specs/04-views-filters.md ("Vues privees/
// personnelles") in plane-selfhost. IssueView.access already exists and is
// already wired end-to-end everywhere except here and the serializer's
// read_only_fields gate.
export function AccessController(props: Props) {
  const { control } = props;
  const { t } = useTranslation();

  return (
    <Controller
      control={control}
      name="access"
      render={({ field: { onChange, value } }) => {
        const selected = VIEW_ACCESS_SPECIFIERS.find((option) => option.key === value) ?? VIEW_ACCESS_SPECIFIERS[0];
        const SelectedIcon = selected.icon;
        return (
          <CustomSelect
            value={value ?? EViewAccess.PUBLIC}
            onChange={onChange}
            buttonClassName="!border-subtle font-medium !shadow-none"
            label={
              <div className="flex items-center gap-1.5">
                <SelectedIcon className="h-3.5 w-3.5" />
                {t(selected.i18n_label)}
              </div>
            }
          >
            {VIEW_ACCESS_SPECIFIERS.map((option) => {
              const OptionIcon = option.icon;
              return (
                <CustomSelect.Option key={option.key} value={option.key}>
                  <div className="flex items-center gap-2">
                    <OptionIcon className="h-3.5 w-3.5" />
                    {t(option.i18n_label)}
                  </div>
                </CustomSelect.Option>
              );
            })}
          </CustomSelect>
        );
      }}
    />
  );
}
