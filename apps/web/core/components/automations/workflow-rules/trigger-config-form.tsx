/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TWorkflowRuleTriggerConfig } from "@plane/types";
// components
import { StateDropdown } from "@/components/dropdowns/state/dropdown";

type Props = {
  projectId: string;
  triggerConfig: TWorkflowRuleTriggerConfig;
  onChange: (triggerConfig: TWorkflowRuleTriggerConfig) => void;
};

/**
 * Only rendered for the `STATE_CHANGED` trigger - a from-state/to-state
 * pair, each independently optional (omitted entirely means "any
 * transition"). `StateDropdown` itself has no "clear" affordance (its
 * `onChange` always hands back a concrete state id), so each field gets its
 * own explicit clear button here to support leaving it unset.
 */
export function TriggerConfigForm(props: Props) {
  const { projectId, triggerConfig, onChange } = props;
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1.5">
        <span className="text-13 text-secondary">{t("workflow_rules.trigger_config.from_state")}</span>
        <StateDropdown
          projectId={projectId}
          value={triggerConfig.from_state_id ?? null}
          onChange={(value) => onChange({ ...triggerConfig, from_state_id: value })}
          buttonVariant="border-with-text"
          placeholder={t("workflow_rules.trigger_config.any_state")}
        />
        {triggerConfig.from_state_id && (
          <button
            type="button"
            onClick={() => onChange({ ...triggerConfig, from_state_id: undefined })}
            className="rounded-sm p-1 text-tertiary hover:bg-layer-1"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-13 text-secondary">{t("workflow_rules.trigger_config.to_state")}</span>
        <StateDropdown
          projectId={projectId}
          value={triggerConfig.to_state_id ?? null}
          onChange={(value) => onChange({ ...triggerConfig, to_state_id: value })}
          buttonVariant="border-with-text"
          placeholder={t("workflow_rules.trigger_config.any_state")}
        />
        {triggerConfig.to_state_id && (
          <button
            type="button"
            onClick={() => onChange({ ...triggerConfig, to_state_id: undefined })}
            className="rounded-sm p-1 text-tertiary hover:bg-layer-1"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
