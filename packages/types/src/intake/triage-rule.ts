/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TTriageRuleConditionField = "TITLE" | "DESCRIPTION";
export type TTriageRuleConditionOperator = "CONTAINS" | "NOT_CONTAINS" | "STARTS_WITH" | "REGEX";
export type TTriageRuleActionType = "SET_PRIORITY" | "SET_LABELS" | "SET_ASSIGNEES" | "SET_STATE";

export type TTriageRuleCondition = {
  id?: string;
  field: TTriageRuleConditionField;
  operator: TTriageRuleConditionOperator;
  value: string;
  case_sensitive: boolean;
};

export type TTriageRuleAction = {
  id?: string;
  action_type: TTriageRuleActionType;
  priority: string | null;
  state: string | null;
  labels: string[];
  assignees: string[];
};

export type TTriageRule = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  stop_on_match: boolean;
  is_valid: boolean;
  conditions: TTriageRuleCondition[];
  actions: TTriageRuleAction[];
};

export type TTriageRuleDryRunMatch = {
  intake_issue_id: string;
  issue_id: string;
  issue_name: string;
  actions: Record<string, unknown>;
};
