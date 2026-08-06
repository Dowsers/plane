/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Combobox } from "@headlessui/react";
import { Clock, Lock } from "lucide-react";
import { CheckIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";

export type TStateOptionProps = {
  projectId: string | null | undefined;
  option: {
    value: string | undefined;
    query: string;
    content: React.ReactNode;
  };
  selectedValue: string | null | undefined;
  className?: string;
  filterAvailableStateIds?: boolean;
  isForWorkItemCreation?: boolean;
  alwaysAllowStateChange?: boolean;
  /**
   * Governed workflows (docs/feature-specs/06-automation-workflow-sla.md,
   * section 4 in plane-selfhost) - `WorkItemStateDropdownBase` (the sole
   * caller that ever sets these, via `StateDropdown`'s own `issueId` prop -
   * see dropdown.tsx/base.tsx) resolves per-option denial/approval state
   * from `IssueAllowedTransitionsEndpoint` and hands it down here so a
   * denied option renders as visually disabled with its reason on hover,
   * and an approval-gated option stays clickable but is flagged instead of
   * looking identical to a normal one. Every other consumer of this
   * component (e.g. `intake-state/base.tsx`, or any `StateDropdown` used
   * without an `issueId`) never sets these, so it renders exactly as
   * before - this is a strictly additive, opt-in extension of the same
   * plumbing Plane's own paid-tier "workflow" feature already reserved this
   * file for (see this directory's other now-superseded stubs).
   */
  disabled?: boolean;
  deniedReason?: string;
  pendingApproval?: boolean;
};

export const StateOption = observer(function StateOption(props: TStateOptionProps) {
  const { option, className = "", disabled = false, deniedReason, pendingApproval = false } = props;

  // The denial/approval icon is wrapped in its own `Tooltip`, not the whole
  // `Combobox.Option` - HeadlessUI's option owns its own click/keyboard
  // handling internally, and wrapping the entire option in a second
  // component that clones/merges trigger props onto its child (as `Tooltip`
  // does) risks silently breaking state selection. Hovering the icon itself
  // is enough to surface the reason without touching that behavior.
  const tooltipContent = disabled ? deniedReason : pendingApproval ? "This transition requires approval" : undefined;

  return (
    <Combobox.Option
      key={option.value}
      value={option.value}
      disabled={disabled}
      className={({ active, selected }) =>
        cn(
          `${className} ${active && !disabled ? "bg-layer-transparent-hover" : ""} ${selected ? "text-primary" : "text-secondary"}`,
          disabled && "cursor-not-allowed opacity-50"
        )
      }
    >
      {({ selected }) => (
        <>
          <span className="flex-grow truncate">{option.content}</span>
          {(pendingApproval || disabled) && tooltipContent && (
            <Tooltip tooltipContent={tooltipContent} position="right">
              <span className="flex-shrink-0">
                {disabled ? (
                  <Lock className="h-3 w-3 text-tertiary" aria-hidden="true" />
                ) : (
                  <Clock className="h-3 w-3 text-tertiary" aria-hidden="true" />
                )}
              </span>
            </Tooltip>
          )}
          {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
        </>
      )}
    </Combobox.Option>
  );
});
