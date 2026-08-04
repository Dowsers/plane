/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Plus, X } from "lucide-react";
// plane imports
import type { TWorkflowConditionField, TWorkflowConditionOperator } from "@plane/types";
import { Button, CustomSelect } from "@plane/ui";
// local imports
import {
  CONDITION_FIELD_LABELS,
  CONDITION_FIELD_OPTIONS,
  CONDITION_OPERATOR_LABELS,
  getOperatorOptionsForField,
} from "./constants";
import { ConditionValueInput } from "./condition-value-input";
import type { TLocalWorkflowCondition } from "./types";

type Props = {
  projectId: string;
  conditions: TLocalWorkflowCondition[];
  onChange: (conditions: TLocalWorkflowCondition[]) => void;
};

const emptyCondition = (): TLocalWorkflowCondition => ({
  field: "state_id",
  operator: "is",
  value: undefined,
  _key: `local-condition-${Date.now()}-${Math.random().toString(36).slice(2)}`,
});

/**
 * Flat, AND-only condition builder - exigence 8 de
 * docs/feature-specs/06-automation-workflow-sla.md ("Moteur de regles
 * d'automatisation") in plane-selfhost. Deliberately NOT the nested
 * AND/OR/NOT tree builder from `@/components/rich-filters/advanced` - that
 * engine is built for a different, recursive filter-group shape and would
 * be pure overkill for a rule whose conditions are always a single,
 * flat AND list.
 */
export function ConditionList(props: Props) {
  const { projectId, conditions, onChange } = props;

  const updateCondition = (index: number, patch: Partial<TLocalWorkflowCondition>) => {
    onChange(conditions.map((condition, i) => (i === index ? Object.assign({}, condition, patch) : condition)));
  };

  const handleFieldChange = (index: number, field: TWorkflowConditionField) => {
    // Changing the field invalidates the previous operator/value pairing.
    updateCondition(index, { field, operator: "is", value: undefined });
  };

  const handleOperatorChange = (index: number, operator: TWorkflowConditionOperator) => {
    const clearsValue = operator === "is_empty" || operator === "is_not_empty";
    updateCondition(index, { operator, value: clearsValue ? undefined : conditions[index].value });
  };

  return (
    <div className="flex flex-col gap-2">
      <h5 className="text-13 font-medium text-secondary">Conditions (all must match)</h5>
      {conditions.length === 0 && (
        <p className="text-12 text-tertiary">No conditions - the rule always applies when the trigger fires.</p>
      )}
      {conditions.map((condition, index) => (
        <div key={condition._key} className="flex flex-wrap items-center gap-2">
          <CustomSelect
            value={condition.field}
            label={CONDITION_FIELD_LABELS[condition.field]}
            onChange={(value: TWorkflowConditionField) => handleFieldChange(index, value)}
            input
          >
            {CONDITION_FIELD_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {option.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          <CustomSelect
            value={condition.operator}
            label={CONDITION_OPERATOR_LABELS[condition.operator]}
            onChange={(value: TWorkflowConditionOperator) => handleOperatorChange(index, value)}
            input
          >
            {getOperatorOptionsForField(condition.field).map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {option.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          <div className="min-w-[160px] flex-1">
            <ConditionValueInput
              projectId={projectId}
              field={condition.field}
              operator={condition.operator}
              value={condition.value}
              onChange={(value) => updateCondition(index, { value })}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(conditions.filter((_, i) => i !== index))}
            className="shrink-0 rounded-sm p-1 text-tertiary hover:bg-layer-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button
        variant="link-primary"
        size="sm"
        className="w-fit"
        prependIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => onChange([...conditions, emptyCondition()])}
      >
        Add condition
      </Button>
    </div>
  );
}
