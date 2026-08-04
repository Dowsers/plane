/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { getButtonStyling } from "@plane/propel/button";
import { ChevronDownIcon } from "@plane/propel/icons";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";

export type TGenericMultiSelectOption = {
  value: string;
  label: string;
  content?: React.ReactNode;
};

type Props = {
  value: string[] | undefined;
  onChange: (val: string[]) => void;
  options: TGenericMultiSelectOption[];
  placeholder: string;
};

/**
 * Small, generic multi-select built on `CustomSearchSelect` (the same
 * primitive `apps/web/core/components/analytics/select/project.tsx` uses
 * for the legacy analytics builder's project picker) - reused here for the
 * dashboard `table` widget's state/assignee/label/priority filter pickers,
 * since none of those need anything more specialized than "pick N from a
 * searchable list".
 */
export function DashboardGenericMultiSelect(props: Props) {
  const { value, onChange, options, placeholder } = props;

  const searchOptions = options.map((option) => ({
    value: option.value,
    query: option.label,
    content: option.content ?? option.label,
  }));

  const selectedLabels = options.filter((option) => value?.includes(option.value)).map((option) => option.label);

  return (
    <CustomSearchSelect
      value={value ?? []}
      onChange={(val: string[]) => onChange(val)}
      options={searchOptions}
      className="w-full"
      customButton={
        <div className={cn(getButtonStyling("secondary", "base"), "w-full justify-between gap-2")}>
          <span className="truncate">{selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}</span>
          <ChevronDownIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
        </div>
      }
      customButtonClassName="w-full"
      multiple
    />
  );
}
