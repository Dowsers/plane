/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Input } from "@plane/propel/input";
import type { TFilterConditionNodeForDisplay, TFilterProperty, TTextFilterFieldConfig } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import useDebounce from "@/hooks/use-debounce";
// local imports
import { COMMON_FILTER_ITEM_BORDER_CLASSNAME, EMPTY_FILTER_PLACEHOLDER_TEXT } from "../../shared";

type TTextFilterValueInputProps<P extends TFilterProperty> = {
  config: TTextFilterFieldConfig<string>;
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (value: string | undefined) => void;
};

const getStringValue = (value: unknown): string => (typeof value === "string" ? value : "");

export const TextFilterValueInput = observer(function TextFilterValueInput<P extends TFilterProperty>(
  props: TTextFilterValueInputProps<P>
) {
  const { config, condition, isDisabled, onChange } = props;
  // states
  const [localValue, setLocalValue] = useState<string>(getStringValue(condition.value));
  // derived values
  const debouncedValue = useDebounce(localValue, 500);

  // Keep local state in sync when the underlying condition value changes from elsewhere
  // (e.g. clearing filters, switching operators, or loading a saved view).
  useEffect(() => {
    const conditionValue = getStringValue(condition.value);
    setLocalValue((current) => (current === conditionValue ? current : conditionValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition.value]);

  useEffect(() => {
    const trimmedValue = debouncedValue.trim();
    if (trimmedValue === getStringValue(condition.value)) return;
    onChange(trimmedValue.length > 0 ? trimmedValue : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <Input
      id="single-local-value"
      name="single-local-value"
      value={localValue}
      onChange={(event) => setLocalValue(event.target.value)}
      placeholder={config.placeholder ?? EMPTY_FILTER_PLACEHOLDER_TEXT}
      mode="true-transparent"
      inputSize="xs"
      disabled={isDisabled}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focus a freshly-added, still-empty filter's input
      autoFocus={!condition.value}
      className={cn("h-full w-full rounded-none px-2 text-13", !isDisabled && COMMON_FILTER_ITEM_BORDER_CLASSNAME)}
    />
  );
});
