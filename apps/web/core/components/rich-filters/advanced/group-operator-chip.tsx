/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { TLogicalOperator } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";
import { cn } from "@plane/utils";

type TGroupOperatorChipProps = {
  logicalOperator: TLogicalOperator;
  onToggle?: () => void;
  isDisabled?: boolean;
};

/**
 * Small clickable "AND"/"OR" chip representing (and, when enabled, toggling) a group's logical
 * operator. Every child-to-child connector within the same group renders one of these - since a
 * group has a single operator for all of its children, clicking any of them flips the whole group.
 */
export const GroupOperatorChip = observer(function GroupOperatorChip(props: TGroupOperatorChipProps) {
  const { logicalOperator, onToggle, isDisabled = false } = props;
  const label = logicalOperator === LOGICAL_OPERATOR.OR ? "OR" : "AND";

  const commonClassName = cn(
    "inline-flex h-5 items-center justify-center rounded-full px-2 text-11 font-medium whitespace-nowrap",
    logicalOperator === LOGICAL_OPERATOR.OR ? "bg-amber-50 text-amber-700" : "bg-accent-primary/10 text-accent-primary"
  );

  if (isDisabled || !onToggle) {
    return <span className={commonClassName}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(commonClassName, "cursor-pointer transition-opacity hover:opacity-80")}
      title="Toggle this group between AND / OR"
    >
      {label}
    </button>
  );
});
