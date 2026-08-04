/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { X } from "lucide-react";

type TSingleValuePickerProps = {
  value: string | null;
  onChange: (value: string) => void;
};

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
  renderPicker: (props: TSingleValuePickerProps) => React.ReactNode;
};

/**
 * Generic fallback for condition fields whose value picker has no native
 * multi-select variant in this codebase (state/priority/cycle - see
 * `SINGLE_VALUE_ONLY_CONDITION_FIELDS` in ./constants.ts). Renders one
 * instance of the given single-value picker per selected id (each acting as
 * a removable "chip" that can also be changed in place), plus one more,
 * always-empty instance used purely to add a new value.
 */
export function MultiValueChipPicker(props: Props) {
  const { value, onChange, renderPicker } = props;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((id, index) => (
        <div key={id} className="flex items-center gap-1 rounded-md border border-subtle-1 py-0.5 pr-1">
          {renderPicker({
            value: id,
            onChange: (newValue) => onChange(value.map((v, i) => (i === index ? newValue : v))),
          })}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="rounded-sm p-0.5 text-tertiary hover:bg-layer-1"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div key={`add-${value.length}`}>
        {renderPicker({
          value: null,
          onChange: (newValue) => {
            if (newValue && !value.includes(newValue)) onChange([...value, newValue]);
          },
        })}
      </div>
    </div>
  );
}
