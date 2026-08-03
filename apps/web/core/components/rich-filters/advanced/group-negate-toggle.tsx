/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { cn } from "@plane/utils";

type TGroupNegateToggleProps = {
  isNegated: boolean;
  onToggle?: () => void;
  isDisabled?: boolean;
};

/**
 * Small "NOT" pill representing (and, when enabled, toggling) a group's `negate` flag - equivalent
 * to wrapping the whole group in "NOT (...)". Hidden entirely when disabled and not active, so a
 * read-only view of a non-negated group doesn't show a dead control.
 */
export const GroupNegateToggle = observer(function GroupNegateToggle(props: TGroupNegateToggleProps) {
  const { isNegated, onToggle, isDisabled = false } = props;

  if (isDisabled || !onToggle) {
    if (!isNegated) return null;
    return (
      <span className="inline-flex h-5 items-center justify-center rounded-full bg-danger-subtle px-2 text-11 font-medium text-danger-primary">
        NOT
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isNegated}
      className={cn(
        "inline-flex h-5 items-center justify-center rounded-full border px-2 text-11 font-medium whitespace-nowrap transition-colors",
        isNegated
          ? "border-danger-subtle bg-danger-subtle text-danger-primary hover:bg-danger-subtle-hover"
          : "border-subtle-1 bg-layer-2 text-placeholder hover:text-secondary"
      )}
      title="Negate this group (NOT)"
    >
      NOT
    </button>
  );
});
