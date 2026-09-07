/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Plus, X } from "lucide-react";
// plane imports
import { WORKFLOW_TRANSITION_REQUIRED_FIELD_OPTIONS } from "@plane/types";
import type {
  TWorkflowTransitionConditionConfigLabel,
  TWorkflowTransitionConditionConfigRequiredFields,
  TWorkflowTransitionConditionType,
} from "@plane/types";
import { Button, Checkbox, CustomSelect } from "@plane/ui";
// local imports
import { CONDITION_TYPE_LABELS, CONDITION_TYPE_OPTIONS, MAX_CONDITIONS_PER_TRANSITION } from "./constants";
import { SingleLabelPicker } from "./single-label-picker";
import type { TLocalWorkflowTransitionCondition } from "./types";

type Props = {
  projectId: string;
  conditions: TLocalWorkflowTransitionCondition[];
  onChange: (conditions: TLocalWorkflowTransitionCondition[]) => void;
};

const emptyCondition = (): TLocalWorkflowTransitionCondition => ({
  condition_type: "SUB_ISSUES_CLOSED",
  config: {},
  _key: `local-condition-${Date.now()}-${Math.random().toString(36).slice(2)}`,
});

/**
 * AND-combined precondition builder - exigence 3/8 of
 * docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
 * multi-etats avec approbations") in plane-selfhost. Only 5 fixed condition
 * types exist (no operator/value-picker generality needed like the sibling
 * workflow-rules feature's `ConditionList`), so this is a flat type-select +
 * per-type config row rather than a field/operator/value triple.
 */
export function ConditionList(props: Props) {
  const { projectId, conditions, onChange } = props;

  const updateCondition = (index: number, patch: Partial<TLocalWorkflowTransitionCondition>) => {
    onChange(conditions.map((condition, i) => (i === index ? Object.assign({}, condition, patch) : condition)));
  };

  const atCapacity = conditions.length >= MAX_CONDITIONS_PER_TRANSITION;

  return (
    <div className="flex flex-col gap-2">
      <h5 className="text-13 font-medium text-secondary">Conditions (all must be met)</h5>
      {conditions.length === 0 && (
        <p className="text-12 text-tertiary">No preconditions - the transition has nothing else to check.</p>
      )}
      {conditions.map((condition, index) => (
        <div key={condition._key} className="flex flex-wrap items-center gap-2 rounded-md border border-subtle p-2">
          <CustomSelect
            value={condition.condition_type}
            label={CONDITION_TYPE_LABELS[condition.condition_type]}
            onChange={(value: TWorkflowTransitionConditionType) =>
              updateCondition(index, { condition_type: value, config: {} })
            }
            input
          >
            {CONDITION_TYPE_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {option.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>

          {(condition.condition_type === "LABEL_PRESENT" || condition.condition_type === "LABEL_ABSENT") && (
            <SingleLabelPicker
              projectId={projectId}
              labelId={(condition.config as TWorkflowTransitionConditionConfigLabel).label_id}
              onChange={(labelId) => updateCondition(index, { config: { label_id: labelId ?? "" } })}
            />
          )}

          {condition.condition_type === "REQUIRED_FIELDS_FILLED" && (
            <div className="flex flex-wrap items-center gap-2">
              {WORKFLOW_TRANSITION_REQUIRED_FIELD_OPTIONS.map((field) => {
                const selected =
                  (condition.config as TWorkflowTransitionConditionConfigRequiredFields).field_names ?? [];
                const checked = selected.includes(field.value);
                return (
                  <label
                    key={field.value}
                    htmlFor={`${condition._key}-${field.value}`}
                    className="flex items-center gap-1 text-12 text-secondary"
                  >
                    <Checkbox
                      id={`${condition._key}-${field.value}`}
                      checked={checked}
                      onChange={(event) =>
                        updateCondition(index, {
                          config: {
                            field_names: event.target.checked
                              ? [...selected, field.value]
                              : selected.filter((name) => name !== field.value),
                          },
                        })
                      }
                    />
                    {field.label}
                  </label>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => onChange(conditions.filter((_, i) => i !== index))}
            className="ml-auto shrink-0 rounded-sm p-1 text-tertiary hover:bg-layer-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          variant="link-primary"
          size="sm"
          className="w-fit"
          prependIcon={<Plus className="h-3.5 w-3.5" />}
          disabled={atCapacity}
          onClick={() => onChange([...conditions, emptyCondition()])}
        >
          Add condition
        </Button>
        {atCapacity && (
          <span className="text-11 text-tertiary">Maximum of {MAX_CONDITIONS_PER_TRANSITION} conditions reached.</span>
        )}
      </div>
    </div>
  );
}
