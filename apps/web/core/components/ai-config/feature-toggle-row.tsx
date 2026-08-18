/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { Tooltip } from "@plane/propel/tooltip";

export type TAIFeatureToggleRow = {
  key: string;
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  disabledTooltip?: string;
  isSaving?: boolean;
};

/**
 * One row in Settings > AI's "Features" sub-section - deliberately generic
 * so future category 9 features (status-update drafting, auto-triage,
 * digest, chat assistant - see `WorkspaceAIConfig`'s own docstring,
 * apps/api/plane/db/models/ai_config.py) can add their own toggle row here
 * later without reworking this page, each behind its own flat
 * `Workspace.is_*_enabled` boolean following this same convention.
 */
export const AIFeatureToggleRow = observer(function AIFeatureToggleRow(props: TAIFeatureToggleRow) {
  const { label, description, value, onChange, disabled = false, disabledTooltip, isSaving = false } = props;

  const toggle = <ToggleSwitch value={value} onChange={onChange} disabled={disabled || isSaving} />;

  return (
    <div
      className={cn("flex items-center justify-between gap-4 rounded-md border-[0.5px] border-subtle p-4", {
        "opacity-60": disabled,
      })}
    >
      <div className="flex flex-col gap-1">
        <span className="text-14 font-medium text-primary">{label}</span>
        <span className="text-13 text-secondary">{description}</span>
      </div>
      {disabled && disabledTooltip ? (
        <Tooltip tooltipContent={disabledTooltip} position="top">
          <span>{toggle}</span>
        </Tooltip>
      ) : (
        toggle
      )}
    </div>
  );
});
