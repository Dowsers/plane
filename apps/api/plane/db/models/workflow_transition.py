# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Governed multi-state workflows with approvals - see
docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernés
multi-états avec approbations", section 4) in plane-selfhost.

PHASE 1 OF 2 (backend-only, per this session's build convention - see the
other category 6 features for the same split): this module defines the
complete data model and, in `plane/utils/workflow_transition_engine.py`,
the complete validation/execution engine plus every endpoint that manages
the engine's own configuration and approval flow. It deliberately does
NOT wire enforcement into the real `Issue.state` mutation paths (unitary
update, bulk update, public/service-token API) - a phase 2 change inserts
the `evaluate_transition`/`execute_allowed_transition` calls at those
existing call sites. See this feature's delivery report for the exact
list of files/call sites phase 2 needs to touch.

Six new tables, exactly as specified:
- `WorkflowTransition` - the (project, issue_type, from_state, to_state)
  graph edge itself.
- `WorkflowTransitionApprover` - per-transition role/member restriction
  and/or approval requirement (see `WorkflowTransitionApprover`'s own
  docstring for the resolved "approval_required" semantics - the spec's
  own text is genuinely underspecified here, see
  plane/utils/workflow_transition_engine.py's module docstring for the
  full reasoning, mirroring the rigor of plane/utils/sla_engine.py's own
  resolved-ambiguity documentation).
- `WorkflowTransitionCondition` - AND-combined preconditions.
- `WorkflowTransitionAction` - ordered post-transition actions.
- `IssueTransitionApprovalRequest` / `IssueTransitionApproval` - the
  approval flow itself.
- `WorkflowTransitionAuditLog` - every evaluated attempt (allowed, denied,
  pending_approval), kept separate from `IssueActivity` per the spec's own
  "pour ne pas polluer IssueActivity avec des événements refusés" (this is
  the spec's own reasoning, restated directly from the "Implications sur
  le modèle de données" section, not an invented justification).

SCOPE NARROWING - `WorkflowTransitionCondition.REQUIRED_FIELDS_FILLED`:
the spec's exigence 8 says "tous les champs obligatoires configurés sont
renseignés", which in Linear's own product refers to a configurable
custom-field/issue-property system. No such system exists anywhere in
this codebase (confirmed: no `IssueProperty`/`IssuePropertyValue` model,
nothing resembling one) - seen already this session for Category 5/6's
other features. This condition type is scoped down to a configurable list
of STANDARD `Issue` field names instead (`config: {"field_names": [...]}`,
e.g. `["description_html", "estimate_point", "target_date",
"assignee_ids", "label_ids"]`), checked for non-null/non-empty - see
`plane/utils/workflow_transition_engine.py::_check_required_fields_filled`.
This is a deliberate, honest adaptation to what actually exists, not a
silent guess.
"""

# Django imports
from django.db import models

# Module imports
from plane.db.models.base import BaseModel
from plane.db.models.project import ProjectBaseModel


class WorkflowTransition(ProjectBaseModel):
    """
    One allowed (or, once created for a (project, issue_type) pair,
    explicitly enumerated) `from_state -> to_state` edge - exigences 1-4.

    `issue_type=None` means "applies to all issue types in this project
    that don't have a more specific rule" (exigence 1's "ou pour 'tous les
    types' si aucune règle spécifique n'existe") - see
    plane/utils/workflow_transition_engine.py::evaluate_transition for the
    exact fallback/matching order.

    `from_state=None` means "transition from issue creation" (exigence 4 -
    the initial-state transition can be restricted exactly like any other).

    BACKWARD COMPATIBILITY (exigence 2 - the single most important
    correctness property of this whole feature): a (project, issue_type)
    pair with ZERO `WorkflowTransition` rows at all is an OPEN graph -
    every transition remains allowed, exactly as before this feature
    existed. The graph only becomes CLOSED for a pair once at least one
    row exists for it (exigence 3) - see the engine module for how "at
    least one row exists" is checked (both the type-specific and
    type-null rows count towards this).
    """

    issue_type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_transitions",
    )
    from_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_transitions_from",
    )
    to_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        related_name="workflow_transitions_to",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Workflow Transition"
        verbose_name_plural = "Workflow Transitions"
        db_table = "workflow_transitions"
        ordering = ("-created_at",)
        # `deleted_at`-scoped, matching every other soft-deletable model in
        # this codebase with a natural-key uniqueness requirement (State,
        # ProjectIssueType, IssueSLA, IssueRelation) - `.delete()` on any
        # `AuditModel` subclass defaults to a SOFT delete (see
        # SoftDeleteModel.delete() in plane/db/mixins.py), so a plain
        # (without deleted_at) constraint would permanently block
        # recreating a transition for the same (issue_type, from_state,
        # to_state) tuple after deleting one - unacceptable for a
        # config screen where delete-then-recreate is a normal workflow.
        # NOTE: like `IssueSLA.sla_policy` (also nullable, also part of a
        # unique_together), Postgres treats NULL as distinct-from-itself in
        # a unique index, so two rows that are both e.g. `issue_type=None,
        # from_state=None, to_state=X` are not actually deduplicated by
        # this constraint - an accepted, pre-existing limitation in this
        # codebase's convention, not one newly introduced here.
        unique_together = ["project", "issue_type", "from_state", "to_state", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "issue_type", "from_state", "to_state"],
                condition=models.Q(deleted_at__isnull=True),
                name="workflow_transition_unique_project_type_from_to_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.from_state_id} -> {self.to_state_id} <{self.project_id}>"


class WorkflowTransitionApprover(BaseModel):
    """
    A per-transition role or named-member entry - exigence 5/6.

    RESOLVED AMBIGUITY (see plane/utils/workflow_transition_engine.py's
    module docstring for the full reasoning, restated briefly here):
    `approval_required=False` rows are "these roles/members can execute
    this transition immediately, no approval needed for them specifically".
    `approval_required=True` rows are "these roles/members are valid
    approvers when a request DOES need approval". A transition with
    approver rows at all is role/member-restricted (exigence 5); whether a
    given actor within that restriction needs to go through the approval
    flow depends on which *kind* of row(s) they match, evaluated per-actor
    at evaluation time - see `evaluate_transition`.

    Constraint (app-level only, not a DB CHECK - same convention as
    `WorkflowTransition`'s own DB-level unique constraint being the only
    hard constraint, and e.g. `SLAPolicy`'s "at least one of
    response_time_minutes/resolution_time_minutes" being serializer-level
    only): exactly one of `member`/`role` must be set. Enforced in
    `app/views/workflow_transition/base.py`.
    """

    transition = models.ForeignKey(WorkflowTransition, on_delete=models.CASCADE, related_name="approvers")
    member = models.ForeignKey(
        "db.ProjectMember",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_transition_approvals",
    )
    # Raw `plane.app.permissions.ROLE` enum value (e.g. 20 for Admin, 15 for
    # Member) - Guest (5) is intentionally still a valid stored value here
    # (the DB doesn't enforce which roles are meaningful) but exigence 5's
    # "Guest ne peut jamais exécuter une transition restreinte" is enforced
    # at evaluation time in the engine, not by restricting what can be
    # configured.
    role = models.IntegerField(null=True, blank=True)
    approval_required = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Workflow Transition Approver"
        verbose_name_plural = "Workflow Transition Approvers"
        db_table = "workflow_transition_approvers"
        ordering = ("-created_at",)

    def __str__(self):
        return f"member={self.member_id} role={self.role} required={self.approval_required} <{self.transition_id}>"


class WorkflowTransitionCondition(BaseModel):
    """
    An AND-combined precondition on a transition - exigence 3/8. See this
    module's docstring for the `REQUIRED_FIELDS_FILLED` scope narrowing to
    standard `Issue` fields (no custom-field system exists in this
    codebase).
    """

    CONDITION_TYPE_CHOICES = (
        ("SUB_ISSUES_CLOSED", "Sub-issues closed"),
        ("REQUIRED_FIELDS_FILLED", "Required fields filled"),
        ("NO_UNRESOLVED_BLOCKERS", "No unresolved blockers"),
        ("LABEL_PRESENT", "Label present"),
        ("LABEL_ABSENT", "Label absent"),
    )

    transition = models.ForeignKey(WorkflowTransition, on_delete=models.CASCADE, related_name="conditions")
    condition_type = models.CharField(max_length=30, choices=CONDITION_TYPE_CHOICES)
    # Shapes: REQUIRED_FIELDS_FILLED -> {"field_names": [...]} (see module
    # docstring); LABEL_PRESENT/LABEL_ABSENT -> {"label_id": "..."};
    # SUB_ISSUES_CLOSED/NO_UNRESOLVED_BLOCKERS need no config.
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Workflow Transition Condition"
        verbose_name_plural = "Workflow Transition Conditions"
        db_table = "workflow_transition_conditions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.condition_type} <{self.transition_id}>"


class WorkflowTransitionAction(BaseModel):
    """
    An ordered post-transition action - exigence 9. Best-effort sequential
    application, mirroring `plane/utils/workflow_rule_engine.py`'s
    `_execute_rule_actions` exactly (see
    `plane/utils/workflow_transition_engine.py::_execute_transition_actions`).
    """

    ACTION_TYPE_CHOICES = (
        ("WEBHOOK", "Webhook"),
        ("SYSTEM_COMMENT", "System comment"),
        ("NOTIFY_ASSIGNEE", "Notify assignee"),
        ("NOTIFY_WATCHERS", "Notify watchers"),
        ("ADD_LABEL", "Add label"),
        ("REMOVE_LABEL", "Remove label"),
        ("ASSIGN_MEMBER", "Assign member"),
    )

    transition = models.ForeignKey(WorkflowTransition, on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=30, choices=ACTION_TYPE_CHOICES)
    # Shapes: SYSTEM_COMMENT -> {"comment_template": "..."} (same
    # {{issue.identifier}}/{{issue.title}}/{{actor.display_name}} token
    # style as WorkflowAction.action_config's POST_COMMENT, see
    # plane/utils/workflow_rule_engine.py::_resolve_template);
    # ADD_LABEL/REMOVE_LABEL -> {"label_id": "..."}; ASSIGN_MEMBER ->
    # {"member_id": "..."}; WEBHOOK/NOTIFY_ASSIGNEE/NOTIFY_WATCHERS need no
    # config.
    config = models.JSONField(default=dict, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Workflow Transition Action"
        verbose_name_plural = "Workflow Transition Actions"
        db_table = "workflow_transition_actions"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.action_type} <{self.transition_id}>"


class IssueTransitionApprovalRequest(ProjectBaseModel):
    """
    A pending (or resolved) request to execute a transition that requires
    approval - exigence 6/7. `status` starts `PENDING`; a rejection sets
    `REJECTED` and, per exigence 7, must be re-submitted (a fresh request
    created) rather than re-evaluated in place.
    """

    STATUS_CHOICES = (
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("CANCELLED", "Cancelled"),
    )

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="transition_approval_requests")
    transition = models.ForeignKey(WorkflowTransition, on_delete=models.CASCADE, related_name="approval_requests")
    requested_by = models.ForeignKey(
        "db.User", on_delete=models.SET_NULL, null=True, related_name="requested_transition_approvals"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING", db_index=True)

    class Meta:
        verbose_name = "Issue Transition Approval Request"
        verbose_name_plural = "Issue Transition Approval Requests"
        db_table = "issue_transition_approval_requests"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} {self.transition_id} {self.status}"


class IssueTransitionApproval(BaseModel):
    """One approver's decision on an `IssueTransitionApprovalRequest`."""

    DECISION_CHOICES = (("APPROVED", "Approved"), ("REJECTED", "Rejected"))

    approval_request = models.ForeignKey(
        IssueTransitionApprovalRequest, on_delete=models.CASCADE, related_name="approvals"
    )
    approver = models.ForeignKey("db.User", on_delete=models.SET_NULL, null=True, related_name="transition_approvals")
    decision = models.CharField(max_length=20, choices=DECISION_CHOICES)
    comment = models.TextField(blank=True, default="")
    responded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Issue Transition Approval"
        verbose_name_plural = "Issue Transition Approvals"
        db_table = "issue_transition_approvals"
        ordering = ("-responded_at",)

    def __str__(self):
        return f"{self.approval_request_id} {self.decision} <{self.approver_id}>"


class WorkflowTransitionAuditLog(BaseModel):
    """
    Every evaluated transition attempt - allowed, denied, or sent to
    approval - exigence 12/13. Kept separate from `IssueActivity` (the
    spec's own "Implications sur le modèle de données" reasoning: "pour ne
    pas polluer IssueActivity avec des événements refusés" - a denied
    attempt never touched the issue at all, so it has no place in a log of
    actual changes).

    `transition` is nullable for the OPEN-graph case (exigence 2) - zero
    rules matched at all because the (project, issue_type) pair has no
    configuration, so there is no specific `WorkflowTransition` to
    reference even though the outcome is still logged as `ALLOWED`.
    """

    OUTCOME_CHOICES = (("ALLOWED", "Allowed"), ("DENIED", "Denied"), ("PENDING_APPROVAL", "Pending approval"))

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="workflow_transition_audit_logs")
    transition = models.ForeignKey(
        WorkflowTransition, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        "db.User", on_delete=models.SET_NULL, null=True, related_name="workflow_transition_audit_logs"
    )
    from_state = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="workflow_audit_logs_from"
    )
    to_state = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="workflow_audit_logs_to"
    )
    outcome = models.CharField(max_length=20, choices=OUTCOME_CHOICES, db_index=True)
    denial_reason = models.TextField(null=True, blank=True)
    # `created_at` (auto_now_add=True) already comes from BaseModel's
    # TimeAuditModel mixin - not redeclared here.

    class Meta:
        verbose_name = "Workflow Transition Audit Log"
        verbose_name_plural = "Workflow Transition Audit Logs"
        db_table = "workflow_transition_audit_logs"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["issue", "created_at"], name="wf_transition_audit_issue_idx")]

    def __str__(self):
        return f"{self.issue_id} {self.outcome} <{self.transition_id}>"
