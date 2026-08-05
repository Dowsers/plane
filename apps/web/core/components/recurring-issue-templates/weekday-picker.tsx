/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
// local imports
import { WEEKDAY_OPTIONS } from "./constants";

type Props = {
  /** Python `date.weekday()` convention: 0 = Monday ... 6 = Sunday. */
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
};

/**
 * Only meaningful for `WEEKLY` templates. Deliberately its own small
 * component (rather than reusing some other calendar-app weekday picker)
 * because there is no pre-existing weekday-picker in this codebase to
 * reuse, and any reused component would need to be checked against this
 * field's specific 0=Monday convention (Python's `date.weekday()`, NOT
 * ISO's 1=Monday) before being trusted here.
 */
export function WeekdayPicker(props: Props) {
  const { value, onChange, disabled = false } = props;

  const toggle = (day: number) => {
    if (disabled) return;
    if (value.includes(day)) onChange(value.filter((d) => d !== day));
    // eslint-disable-next-line unicorn/no-array-sort -- freshly-built local array, no shared-reference mutation risk; toSorted() needs an ES2023 lib bump out of scope here
    else onChange([...value, day].sort((a, b) => a - b));
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {WEEKDAY_OPTIONS.map((option) => {
        const isSelected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(option.value)}
            title={option.label}
            className={cn(
              "flex h-7 w-9 items-center justify-center rounded-md border text-caption-sm-medium transition-colors",
              isSelected
                ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                : "border-subtle-1 text-tertiary hover:bg-layer-1",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
