/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CustomSelect } from "@plane/ui";

export type TAxisSelectOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T | null | undefined;
  onChange: (val: T | null) => void;
  options: TAxisSelectOption<T>[];
  placeholder: string;
  /** Renders a "No value" option that clears the field - used by the
   * optional `segment` field on the chart widget config. */
  allowNoValue?: boolean;
  /** Hides options already used elsewhere in the same form (e.g. the
   * segment field can't repeat the chosen x_axis value). */
  hiddenOptions?: T[];
};

/**
 * Small `CustomSelect`-based dropdown for the dashboard chart widget's
 * `x_axis`/`y_axis`/`segment` fields. Deliberately NOT a reuse of the
 * legacy single-project analytics builder's `SelectXAxis`/`SelectYAxis`
 * (`apps/web/core/components/analytics/select/`) - those are typed to the
 * legacy `ChartXAxisProperty`/`ChartYAxisMetric` *uppercase enum* vocabulary
 * (`STATES`, `STATE_GROUPS`, ...), which doesn't exist in the new dashboard
 * widget's raw, lowercase Django field-path vocabulary (`state_id`,
 * `state__group`, ...) - the two option sets aren't interchangeable even
 * though they cover the same underlying dimensions. This mirrors their UI
 * pattern (a `CustomSelect` over a `{value,label}` list) instead.
 */
export function DashboardAxisSelect<T extends string>(props: Props<T>) {
  const { value, onChange, options, placeholder, allowNoValue, hiddenOptions } = props;

  return (
    <CustomSelect
      value={value}
      label={options.find((item) => item.value === value)?.label ?? placeholder}
      onChange={onChange}
      maxHeight="lg"
      buttonClassName="w-full justify-between"
      className="w-full"
    >
      {allowNoValue && <CustomSelect.Option value={null}>{placeholder}</CustomSelect.Option>}
      {options.map((item) => {
        if (hiddenOptions?.includes(item.value)) return null;
        return (
          <CustomSelect.Option key={item.value} value={item.value}>
            {item.label}
          </CustomSelect.Option>
        );
      })}
    </CustomSelect>
  );
}
