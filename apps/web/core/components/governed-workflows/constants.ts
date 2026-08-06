/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EPillVariant } from "@plane/propel/pill";
import { EUserProjectRoles } from "@plane/types";
import type {
  TIssueAllowedTransitionReasonCode,
  TWorkflowTransitionActionType,
  TWorkflowTransitionAuditLogOutcome,
  TWorkflowTransitionConditionType,
} from "@plane/types";

/** Mirrors the constants of the same name in
 * apps/api/plane/app/views/workflow_transition/base.py - kept in sync
 * manually, these are plain constants on the backend too. */
export const MAX_TRANSITIONS_PER_PROJECT = 200;
export const MAX_CONDITIONS_PER_TRANSITION = 5;
export const MAX_ACTIONS_PER_TRANSITION = 5;

export const CONDITION_TYPE_OPTIONS: { value: TWorkflowTransitionConditionType; label: string }[] = [
  { value: "SUB_ISSUES_CLOSED", label: "Sub-issues closed" },
  { value: "REQUIRED_FIELDS_FILLED", label: "Required fields filled" },
  { value: "NO_UNRESOLVED_BLOCKERS", label: "No unresolved blockers" },
  { value: "LABEL_PRESENT", label: "Label present" },
  { value: "LABEL_ABSENT", label: "Label absent" },
];

export const CONDITION_TYPE_LABELS: Record<TWorkflowTransitionConditionType, string> = Object.fromEntries(
  CONDITION_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<TWorkflowTransitionConditionType, string>;

export const ACTION_TYPE_OPTIONS: { value: TWorkflowTransitionActionType; label: string }[] = [
  { value: "SYSTEM_COMMENT", label: "Post system comment" },
  { value: "NOTIFY_ASSIGNEE", label: "Notify assignees" },
  { value: "NOTIFY_WATCHERS", label: "Notify watchers" },
  { value: "ADD_LABEL", label: "Add label" },
  { value: "REMOVE_LABEL", label: "Remove label" },
  { value: "ASSIGN_MEMBER", label: "Assign member" },
  { value: "WEBHOOK", label: "Trigger webhook" },
];

export const ACTION_TYPE_LABELS: Record<TWorkflowTransitionActionType, string> = Object.fromEntries(
  ACTION_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<TWorkflowTransitionActionType, string>;

/** Role options an approver row can restrict to - Guest is included even
 * though the engine always denies it for a restricted transition (see the
 * backend model's own docstring: "Guest ne peut jamais executer une
 * transition restreinte" is enforced at evaluation time, not by hiding it
 * from configuration) - hidden here anyway since configuring an
 * always-denied rule would only confuse an Admin setting this up. */
export const APPROVER_ROLE_OPTIONS: { value: number; label: string }[] = [
  { value: EUserProjectRoles.ADMIN, label: "Admin" },
  { value: EUserProjectRoles.MEMBER, label: "Member" },
];

export const APPROVER_ROLE_LABELS: Record<number, string> = Object.fromEntries(
  APPROVER_ROLE_OPTIONS.map((option) => [option.value, option.label])
);

export const AUDIT_LOG_OUTCOME_OPTIONS: { value: TWorkflowTransitionAuditLogOutcome; label: string }[] = [
  { value: "ALLOWED", label: "Allowed" },
  { value: "DENIED", label: "Denied" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
];

export const AUDIT_LOG_OUTCOME_LABELS: Record<TWorkflowTransitionAuditLogOutcome, string> = {
  ALLOWED: "Allowed",
  DENIED: "Denied",
  PENDING_APPROVAL: "Pending approval",
};

export const AUDIT_LOG_OUTCOME_PILL_VARIANT: Record<TWorkflowTransitionAuditLogOutcome, EPillVariant> = {
  ALLOWED: EPillVariant.SUCCESS,
  DENIED: EPillVariant.ERROR,
  PENDING_APPROVAL: EPillVariant.WARNING,
};

/** Human-readable labels for `IssueAllowedTransitionsEndpoint`'s
 * `reason_code` - see apps/api/plane/app/views/workflow_transition/base.py
 * and plane/utils/workflow_transition_engine.py::evaluate_transition. Used
 * as a fallback when `reason` (the full sentence) isn't available for some
 * reason - `reason` is preferred wherever both exist. */
export const ALLOWED_TRANSITION_REASON_CODE_LABELS: Record<TIssueAllowedTransitionReasonCode, string> = {
  APPROVAL_REQUIRED: "Requires approval",
  TRANSITION_NOT_IN_GRAPH: "Not part of the configured workflow",
  ROLE_NOT_ALLOWED: "You are not authorized for this transition",
  CONDITION_NOT_MET: "A precondition is not met",
};
