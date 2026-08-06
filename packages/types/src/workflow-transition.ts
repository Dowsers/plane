/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Types for governed multi-state workflows with approvals - see
// docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
// multi-etats avec approbations", section 4) in plane-selfhost, and the
// backend half of this feature: apps/api/plane/db/models/workflow_transition.py,
// apps/api/plane/app/serializers/workflow_transition.py,
// apps/api/plane/app/views/workflow_transition/base.py,
// apps/api/plane/utils/workflow_transition_engine.py. Deliberately named
// `TWorkflowTransition*` (not `TWorkflowRule*`, which already exists for the
// sibling, unrelated trigger/condition/action automation engine built for
// category 6 feature 1 - a `WorkflowTransition` is a from-state -> to-state
// graph edge with approvers, not a trigger-fired rule).

/** `WorkflowTransition.approvers` row - exactly one of `member`/`role` is
 * set (enforced server-side, not by this type). See the model's own
 * docstring for the resolved "approval_required" semantics: a `false` row
 * grants direct-execution rights to that member/role even if another row on
 * the same transition has `approval_required=true`; a `true` row only makes
 * that member/role a valid APPROVER for someone else's pending request. */
export type TWorkflowTransitionApprover = {
  id?: string;
  member: string | null;
  /** Raw `plane.app.permissions.ROLE` value - `EUserProjectRoles.ADMIN`
   * (20) / `MEMBER` (15) / `GUEST` (5). */
  role: number | null;
  approval_required: boolean;
};

export type TWorkflowTransitionConditionType =
  | "SUB_ISSUES_CLOSED"
  | "REQUIRED_FIELDS_FILLED"
  | "NO_UNRESOLVED_BLOCKERS"
  | "LABEL_PRESENT"
  | "LABEL_ABSENT";

/** Only `REQUIRED_FIELDS_FILLED`/`LABEL_PRESENT`/`LABEL_ABSENT` carry any
 * config - `SUB_ISSUES_CLOSED`/`NO_UNRESOLVED_BLOCKERS` need none. Scoped to
 * standard `Issue` fields (no custom-field/issue-property system exists in
 * this codebase - see the backend model's own module docstring). */
export type TWorkflowTransitionConditionConfigRequiredFields = { field_names: string[] };
export type TWorkflowTransitionConditionConfigLabel = { label_id: string };
export type TWorkflowTransitionConditionConfig =
  | TWorkflowTransitionConditionConfigRequiredFields
  | TWorkflowTransitionConditionConfigLabel
  | Record<string, never>;

export type TWorkflowTransitionCondition = {
  id?: string;
  condition_type: TWorkflowTransitionConditionType;
  config: TWorkflowTransitionConditionConfig;
};

/** Standard `Issue` fields `REQUIRED_FIELDS_FILLED` may reference - mirrors
 * `_M2M_FIELD_ACCESSORS` plus the plain-field branch in
 * apps/api/plane/utils/workflow_transition_engine.py exactly. */
export const WORKFLOW_TRANSITION_REQUIRED_FIELD_OPTIONS = [
  { value: "description_html", label: "Description" },
  { value: "estimate_point", label: "Estimate" },
  { value: "target_date", label: "Due date" },
  { value: "start_date", label: "Start date" },
  { value: "assignee_ids", label: "Assignees" },
  { value: "label_ids", label: "Labels" },
] as const;

export type TWorkflowTransitionActionType =
  | "WEBHOOK"
  | "SYSTEM_COMMENT"
  | "NOTIFY_ASSIGNEE"
  | "NOTIFY_WATCHERS"
  | "ADD_LABEL"
  | "REMOVE_LABEL"
  | "ASSIGN_MEMBER";

/** Only `SYSTEM_COMMENT`/`ADD_LABEL`/`REMOVE_LABEL`/`ASSIGN_MEMBER` carry any
 * config - `WEBHOOK`/`NOTIFY_ASSIGNEE`/`NOTIFY_WATCHERS` need none. */
export type TWorkflowTransitionActionConfigSystemComment = { comment_template: string };
export type TWorkflowTransitionActionConfigLabel = { label_id: string };
export type TWorkflowTransitionActionConfigAssignMember = { member_id: string };
export type TWorkflowTransitionActionConfig =
  | TWorkflowTransitionActionConfigSystemComment
  | TWorkflowTransitionActionConfigLabel
  | TWorkflowTransitionActionConfigAssignMember
  | Record<string, never>;

export type TWorkflowTransitionAction = {
  id?: string;
  action_type: TWorkflowTransitionActionType;
  config: TWorkflowTransitionActionConfig;
  sort_order: number;
};

export type TWorkflowTransition = {
  id: string;
  workspace_id: string;
  project_id: string;
  /** `null` = "applies to all issue types in this project that don't have a
   * more specific rule" - see the backend model's docstring. */
  issue_type: string | null;
  /** `null` = "transition from issue creation" - not enforced anywhere yet
   * (phase 2 deliberately does not gate issue creation), still configurable
   * for a future creation-time gate and for symmetry with the data model. */
  from_state: string | null;
  to_state: string;
  is_active: boolean;
  approvers: TWorkflowTransitionApprover[];
  conditions: TWorkflowTransitionCondition[];
  actions: TWorkflowTransitionAction[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type TWorkflowTransitionPayload = Partial<
  Pick<TWorkflowTransition, "issue_type" | "from_state" | "to_state" | "is_active" | "approvers" | "conditions" | "actions">
>;

export type TIssueTransitionApprovalDecision = "APPROVED" | "REJECTED";

export type TIssueTransitionApproval = {
  id: string;
  approval_request: string;
  approver: string | null;
  decision: TIssueTransitionApprovalDecision;
  comment: string;
  responded_at: string;
};

export type TIssueTransitionApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type TIssueTransitionApprovalRequest = {
  id: string;
  workspace_id: string;
  project_id: string;
  issue: string;
  transition: string;
  requested_by: string | null;
  status: TIssueTransitionApprovalRequestStatus;
  approvals: TIssueTransitionApproval[];
  created_at: string;
  updated_at: string;
};

export type TWorkflowTransitionAuditLogOutcome = "ALLOWED" | "DENIED" | "PENDING_APPROVAL";

export type TWorkflowTransitionAuditLog = {
  id: string;
  issue: string;
  transition: string | null;
  actor: string | null;
  from_state: string | null;
  to_state: string | null;
  outcome: TWorkflowTransitionAuditLogOutcome;
  denial_reason: string | null;
  created_at: string;
};

export type TWorkflowTransitionAuditLogParams = {
  cursor?: string;
  per_page?: number;
  issue_id?: string;
  outcome?: TWorkflowTransitionAuditLogOutcome;
  order_by?: string;
};

/** One entry per `State` in the issue's project - the shape
 * `IssueAllowedTransitionsEndpoint` returns. `allowed: false` covers BOTH a
 * hard deny (`reason_code` is one of `TRANSITION_NOT_IN_GRAPH`/
 * `ROLE_NOT_ALLOWED`/`CONDITION_NOT_MET`) and an approval-gated transition
 * (`reason_code === "APPROVAL_REQUIRED"`) - callers that need to tell these
 * apart (e.g. to keep an option selectable vs. fully disabled) must switch
 * on `reason_code`, not just `allowed`. */
export type TIssueAllowedTransitionReasonCode =
  | "APPROVAL_REQUIRED"
  | "TRANSITION_NOT_IN_GRAPH"
  | "ROLE_NOT_ALLOWED"
  | "CONDITION_NOT_MET";

export type TIssueAllowedTransitionEntry = {
  state_id: string;
  allowed: boolean;
  reason_code?: TIssueAllowedTransitionReasonCode;
  reason?: string;
};

/** The success-shaped-but-deferred response body a state-changing PATCH
 * returns (200, not the usual 204) when it hits a transition that needs
 * approval - see apps/api/plane/app/views/issue/base.py::partial_update and
 * apps/api/plane/api/views/issue.py::IssueDetailAPIEndpoint.patch. The
 * requested `state` was NOT written - only whatever other fields were
 * bundled into the same PATCH were. */
export type TIssueTransitionPendingApprovalResponse = {
  pending_approval: true;
  transition_id: string;
  approval_request_id: string;
};

/** The error body a state-changing PATCH returns (403) when the transition
 * is denied outright - never reaches the DB. */
export type TIssueTransitionDeniedError = {
  error_code: "TRANSITION_NOT_ALLOWED";
  reason: string;
};
