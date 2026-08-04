/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EPillVariant } from "@plane/propel/pill";
import type {
  TWorkflowActionType,
  TWorkflowConditionField,
  TWorkflowConditionOperator,
  TWorkflowExecutionSkipReason,
  TWorkflowExecutionStatus,
  TWorkflowTriggerType,
} from "@plane/types";

/** Mirrors `MAX_ACTIONS_PER_RULE` in
 * apps/api/plane/app/views/workflow_rule/base.py - kept in sync manually,
 * this is a plain constant on the backend too. */
export const MAX_ACTIONS_PER_RULE = 20;

/** Verbatim copies of the error strings returned by
 * `_validate_actions_payload` in apps/api/plane/app/views/workflow_rule/base.py
 * (the viewset's own request-payload check, which is what a client actually
 * hits - not `WorkflowRuleSerializer.validate_actions`, which has a
 * slightly different, trailing-period message but is never reached by this
 * viewset's create/update methods since they don't call `serializer.save()`).
 * Checked client-side for immediate feedback, and rendered verbatim if the
 * API ever returns one of these anyway. */
export const ERROR_ZERO_ACTIONS = "A workflow rule must have at least one action";
export const ERROR_MAX_ACTIONS = `A rule can have at most ${MAX_ACTIONS_PER_RULE} actions`;

export const TRIGGER_TYPE_OPTIONS: { value: TWorkflowTriggerType; label: string }[] = [
  { value: "ISSUE_CREATED", label: "Issue created" },
  { value: "ISSUE_UPDATED", label: "Issue updated" },
  { value: "STATE_CHANGED", label: "State changed" },
  { value: "ASSIGNEE_CHANGED", label: "Assignee changed" },
  { value: "PRIORITY_CHANGED", label: "Priority changed" },
  { value: "LABEL_ADDED", label: "Label added" },
  { value: "COMMENT_ADDED", label: "Comment added" },
];

export const TRIGGER_TYPE_LABELS: Record<TWorkflowTriggerType, string> = Object.fromEntries(
  TRIGGER_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<TWorkflowTriggerType, string>;

export const ACTION_TYPE_OPTIONS: { value: TWorkflowActionType; label: string }[] = [
  { value: "SET_STATE", label: "Set state" },
  { value: "SET_PRIORITY", label: "Set priority" },
  { value: "SET_ASSIGNEES", label: "Set assignees" },
  { value: "ADD_LABELS", label: "Add labels" },
  { value: "REMOVE_LABELS", label: "Remove labels" },
  { value: "SET_DUE_DATE", label: "Set due date" },
  { value: "SET_START_DATE", label: "Set start date" },
  { value: "POST_COMMENT", label: "Post comment" },
  { value: "MENTION_USER", label: "Mention user" },
];

export const ACTION_TYPE_LABELS: Record<TWorkflowActionType, string> = Object.fromEntries(
  ACTION_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<TWorkflowActionType, string>;

export const CONDITION_FIELD_OPTIONS: { value: TWorkflowConditionField; label: string }[] = [
  { value: "state_id", label: "State" },
  { value: "priority", label: "Priority" },
  { value: "label_id", label: "Label" },
  { value: "assignee_id", label: "Assignee" },
  { value: "module_id", label: "Module" },
  { value: "cycle_id", label: "Cycle" },
];

export const CONDITION_FIELD_LABELS: Record<TWorkflowConditionField, string> = Object.fromEntries(
  CONDITION_FIELD_OPTIONS.map((option) => [option.value, option.label])
) as Record<TWorkflowConditionField, string>;

export const CONDITION_OPERATOR_LABELS: Record<TWorkflowConditionOperator, string> = {
  is: "is",
  in: "is any of",
  is_not: "is not",
  not_in: "is none of",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

/** Only these fields have a `<field>__isnull` filter on the backend
 * (`ISNULL_CAPABLE_FIELDS` in apps/api/plane/utils/workflow_rule_engine.py)
 * - `is_empty`/`is_not_empty` are only offered for them. */
export const ISNULL_CAPABLE_CONDITION_FIELDS: TWorkflowConditionField[] = [
  "label_id",
  "assignee_id",
  "module_id",
  "cycle_id",
];

export const getOperatorOptionsForField = (
  field: TWorkflowConditionField
): { value: TWorkflowConditionOperator; label: string }[] => {
  const base: TWorkflowConditionOperator[] = ["is", "is_not", "in", "not_in"];
  const operators: TWorkflowConditionOperator[] = ISNULL_CAPABLE_CONDITION_FIELDS.includes(field)
    ? [...base, "is_empty", "is_not_empty"]
    : base;
  return operators.map((value) => ({ value, label: CONDITION_OPERATOR_LABELS[value] }));
};

/** Fields whose value picker has no native multi-select variant in this
 * codebase's dropdown components (state/priority/cycle) - `in`/`not_in`
 * conditions on them fall back to the generic `MultiValueChipPicker`
 * wrapper instead. `label_id`/`assignee_id`/`module_id` use their own
 * dropdown's native multi-select support directly. */
export const SINGLE_VALUE_ONLY_CONDITION_FIELDS: TWorkflowConditionField[] = ["state_id", "priority", "cycle_id"];

export const EXECUTION_STATUS_OPTIONS: { value: TWorkflowExecutionStatus; label: string }[] = [
  { value: "SUCCESS", label: "Success" },
  { value: "FAILED", label: "Failed" },
  { value: "SKIPPED", label: "Skipped" },
];

export const EXECUTION_STATUS_LABELS: Record<TWorkflowExecutionStatus, string> = {
  SUCCESS: "Success",
  FAILED: "Failed",
  SKIPPED: "Skipped",
};

export const EXECUTION_STATUS_PILL_VARIANT: Record<TWorkflowExecutionStatus, EPillVariant> = {
  SUCCESS: EPillVariant.SUCCESS,
  FAILED: EPillVariant.ERROR,
  SKIPPED: EPillVariant.WARNING,
};

/** Human-readable labels for the fixed, snake_case skip reasons a `SKIPPED`
 * execution log's `error_message` can hold - see
 * `evaluate_rules_for_issue` in apps/api/plane/utils/workflow_rule_engine.py.
 * Deliberately a flat lookup rather than a full i18n mapping - only 4 fixed
 * values, disproportionate to wire through the translation system. */
export const SKIP_REASON_LABELS: Record<TWorkflowExecutionSkipReason, string> = {
  trigger_config_not_matched: "Trigger not matched",
  conditions_not_matched: "Conditions not met",
  chain_depth_exceeded: "Chain depth exceeded",
  rate_limit_exceeded: "Rate limit exceeded",
};

export const COMMENT_TEMPLATE_TOKENS: { token: string; label: string }[] = [
  { token: "{{issue.identifier}}", label: "Issue ID" },
  { token: "{{issue.title}}", label: "Issue title" },
  { token: "{{actor.display_name}}", label: "Actor name" },
];
