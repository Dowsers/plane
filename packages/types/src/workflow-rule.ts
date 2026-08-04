/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Types for the project-scoped workflow rule engine - see
// docs/feature-specs/06-automation-workflow-sla.md ("Moteur de regles
// d'automatisation") in plane-selfhost, and the backend half of this
// feature: apps/api/plane/app/views/workflow_rule/base.py,
// apps/api/plane/app/serializers/workflow_rule.py,
// apps/api/plane/utils/workflow_rule_engine.py. Deliberately named
// `TWorkflowRule*` (not `TRule*`/`TAutomationRule*`) to stay unambiguous
// next to the pre-existing, narrower `TTriageRule*` family
// (packages/types/src/intake/triage-rule.ts), which only fires on intake
// issue creation.

export type TWorkflowTriggerType =
  | "ISSUE_CREATED"
  | "ISSUE_UPDATED"
  | "STATE_CHANGED"
  | "ASSIGNEE_CHANGED"
  | "PRIORITY_CHANGED"
  | "LABEL_ADDED"
  | "COMMENT_ADDED";

/** Only meaningful for `STATE_CHANGED` - both keys optional, either or both
 * may be present. Absent entirely for every other trigger type. */
export type TWorkflowRuleTriggerConfig = {
  from_state_id?: string;
  to_state_id?: string;
};

export type TWorkflowConditionField = "state_id" | "priority" | "label_id" | "assignee_id" | "module_id" | "cycle_id";

export type TWorkflowConditionOperator = "is" | "in" | "is_not" | "not_in" | "is_empty" | "is_not_empty";

export type TWorkflowRuleCondition = {
  field: TWorkflowConditionField;
  operator: TWorkflowConditionOperator;
  /** scalar for `is`/`is_not`, array for `in`/`not_in`, omitted/null for
   * `is_empty`/`is_not_empty`. */
  value?: string | string[] | null;
};

export type TWorkflowActionType =
  | "SET_STATE"
  | "SET_PRIORITY"
  | "SET_ASSIGNEES"
  | "ADD_LABELS"
  | "REMOVE_LABELS"
  | "SET_DUE_DATE"
  | "SET_START_DATE"
  | "POST_COMMENT"
  | "MENTION_USER";

export type TWorkflowActionConfigSetState = { state_id: string };
export type TWorkflowActionConfigSetPriority = { priority: "urgent" | "high" | "medium" | "low" | "none" };
export type TWorkflowActionConfigSetAssignees = { assignee_ids: string[]; mode: "replace" | "add" };
export type TWorkflowActionConfigLabels = { label_ids: string[] };
export type TWorkflowActionConfigDate =
  | { mode: "fixed"; date: string }
  | { mode: "relative"; days_from_trigger: number };
export type TWorkflowActionConfigPostComment = { comment_template: string };
export type TWorkflowActionConfigMentionUser = { user_id: string; comment_template: string };

export type TWorkflowActionConfig =
  | TWorkflowActionConfigSetState
  | TWorkflowActionConfigSetPriority
  | TWorkflowActionConfigSetAssignees
  | TWorkflowActionConfigLabels
  | TWorkflowActionConfigDate
  | TWorkflowActionConfigPostComment
  | TWorkflowActionConfigMentionUser
  | Record<string, never>;

export type TWorkflowAction = {
  id?: string;
  action_type: TWorkflowActionType;
  action_config: TWorkflowActionConfig;
  sort_order: number;
};

export type TWorkflowRule = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description: string;
  is_active: boolean;
  trigger_type: TWorkflowTriggerType;
  trigger_config: TWorkflowRuleTriggerConfig;
  conditions: TWorkflowRuleCondition[];
  execution_count: number;
  last_triggered_at: string | null;
  actions: TWorkflowAction[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type TWorkflowRulePayload = Partial<
  Pick<
    TWorkflowRule,
    "name" | "description" | "is_active" | "trigger_type" | "trigger_config" | "conditions" | "actions"
  >
>;

export type TWorkflowExecutionStatus = "SUCCESS" | "FAILED" | "SKIPPED";

/** One of these four fixed, snake_case reasons whenever `status` is
 * `SKIPPED` - see `evaluate_rules_for_issue` in
 * apps/api/plane/utils/workflow_rule_engine.py. */
export type TWorkflowExecutionSkipReason =
  | "trigger_config_not_matched"
  | "conditions_not_matched"
  | "chain_depth_exceeded"
  | "rate_limit_exceeded";

export type TWorkflowActionApplied = {
  action_id: string;
  action_type: string;
  status: "applied" | "failed";
  detail?: string;
  error?: string;
  comment_id?: string;
};

export type TWorkflowRuleExecutionLog = {
  id: string;
  rule: string;
  issue: string;
  trigger_event: string;
  status: TWorkflowExecutionStatus;
  actions_applied: TWorkflowActionApplied[];
  error_message: string | null;
  chain_depth: number;
  executed_at: string;
};

export type TWorkflowRuleExecutionLogParams = {
  cursor?: string;
  per_page?: number;
  status?: TWorkflowExecutionStatus;
  date_from?: string;
  date_to?: string;
  order_by?: string;
};
