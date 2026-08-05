# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Governed multi-state workflows - see
docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernés
multi-états avec approbations", section 4) in plane-selfhost.

PHASE 1 OF 2: this module owns the `WorkflowTransition` configuration CRUD
(Admin-only, project level, same convention as `WorkflowRuleViewSet` in
app/views/workflow_rule/base.py) and the approval-flow endpoints. It does
NOT modify `Issue.state` through any real mutation path (unitary update,
bulk update, public API) - see this feature's delivery report for exactly
which files/call sites a phase 2 change needs to touch. The only place
`Issue.state` is written from this module is the legitimate purpose of
the approval flow itself (`IssueTransitionApprovalApproveEndpoint` calling
`approve_transition_request` -> `execute_allowed_transition`) - which is
explicitly in scope per this phase's brief.
"""

from django.db import IntegrityError

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    IssueTransitionApprovalRequestSerializer,
    WorkflowTransitionActionSerializer,
    WorkflowTransitionApproverSerializer,
    WorkflowTransitionAuditLogSerializer,
    WorkflowTransitionConditionSerializer,
    WorkflowTransitionSerializer,
)
from plane.db.models import (
    Issue,
    IssueTransitionApprovalRequest,
    IssueType,
    Project,
    State,
    WorkflowTransition,
    WorkflowTransitionAction,
    WorkflowTransitionApprover,
    WorkflowTransitionAuditLog,
    WorkflowTransitionCondition,
)
from plane.utils.workflow_transition_engine import (
    approve_transition_request,
    can_approve_transition,
    create_approval_request,
    evaluate_transition,
)

from ..base import BaseAPIView, BaseViewSet

# Exigence 16's own example numbers, used verbatim.
MAX_TRANSITIONS_PER_PROJECT = 200
MAX_CONDITIONS_PER_TRANSITION = 5
MAX_ACTIONS_PER_TRANSITION = 5

_CONDITION_TYPES = dict(WorkflowTransitionCondition.CONDITION_TYPE_CHOICES)
_ACTION_TYPES = dict(WorkflowTransitionAction.ACTION_TYPE_CHOICES)


def _validate_transition_values(project, values):
    """`values` is the fully-merged (existing + requested) set of
    id-valued fields - same "merge, then validate the merged result"
    convention as app/views/sla/base.py::_validate_policy_values, used
    identically for create and partial_update."""
    if not values.get("to_state_id"):
        return "to_state is required"
    if not State.objects.filter(id=values["to_state_id"], project_id=project.id).exists():
        return "Invalid to_state for this project"
    if values.get("from_state_id") and not State.objects.filter(
        id=values["from_state_id"], project_id=project.id
    ).exists():
        return "Invalid from_state for this project"
    if values.get("issue_type_id") and not IssueType.objects.filter(
        id=values["issue_type_id"], workspace_id=project.workspace_id
    ).exists():
        return "Invalid issue_type for this workspace"
    return None


def _validate_nested_payload(approvers_data, conditions_data, actions_data):
    if len(conditions_data) > MAX_CONDITIONS_PER_TRANSITION:
        return f"A transition can have at most {MAX_CONDITIONS_PER_TRANSITION} conditions"
    if len(actions_data) > MAX_ACTIONS_PER_TRANSITION:
        return f"A transition can have at most {MAX_ACTIONS_PER_TRANSITION} actions"

    for row in approvers_data:
        has_member = bool(row.get("member"))
        has_role = row.get("role") is not None
        if has_member == has_role:  # both set, or neither
            return "Each approver must set exactly one of member/role"

    for row in conditions_data:
        if row.get("condition_type") not in _CONDITION_TYPES:
            return f"Invalid condition_type '{row.get('condition_type')}'"

    for row in actions_data:
        if row.get("action_type") not in _ACTION_TYPES:
            return f"Invalid action_type '{row.get('action_type')}'"

    return None


class WorkflowTransitionViewSet(BaseViewSet):
    """
    ADMIN-only for every verb, including read - same convention
    `WorkflowRuleViewSet`/`SLAPolicyViewSet` already use for their own
    config-screen-gating (this category's established pattern: Member/
    Guest/Viewer never see the configuration screen at all).

    Nested `approvers`/`conditions`/`actions` are reconciled manually on
    PATCH (update existing by id, create new ones without an id, delete
    ones no longer present) - the same established convention as
    `WorkflowRuleViewSet._reconcile_actions`. Granular
    add/remove-single-item endpoints also exist below
    (`WorkflowTransitionApproverEndpoint` etc.) per the spec's own
    "POST/DELETE .../approvers/ et /conditions/ et /actions/ — gestion
    granulaire" - both paths are supported, not one instead of the other.
    """

    serializer_class = WorkflowTransitionSerializer
    model = WorkflowTransition

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .prefetch_related("approvers", "conditions", "actions")
            .order_by("-created_at")
        )

    def _create_approvers(self, transition, approvers_data):
        WorkflowTransitionApprover.objects.bulk_create(
            [
                WorkflowTransitionApprover(
                    transition=transition,
                    member_id=row.get("member"),
                    role=row.get("role"),
                    approval_required=row.get("approval_required", False),
                )
                for row in approvers_data
            ]
        )

    def _reconcile_approvers(self, transition, approvers_data):
        existing = {str(a.id): a for a in transition.approvers.all()}
        seen_ids = set()
        for row in approvers_data:
            row_id = row.get("id")
            if row_id and str(row_id) in existing:
                obj = existing[str(row_id)]
                obj.member_id = row.get("member", obj.member_id)
                obj.role = row.get("role", obj.role)
                obj.approval_required = row.get("approval_required", obj.approval_required)
                obj.save(update_fields=["member", "role", "approval_required"])
                seen_ids.add(str(row_id))
            else:
                WorkflowTransitionApprover.objects.create(
                    transition=transition,
                    member_id=row.get("member"),
                    role=row.get("role"),
                    approval_required=row.get("approval_required", False),
                )
        for obj_id, obj in existing.items():
            if obj_id not in seen_ids:
                obj.delete()

    def _create_conditions(self, transition, conditions_data):
        WorkflowTransitionCondition.objects.bulk_create(
            [
                WorkflowTransitionCondition(
                    transition=transition,
                    condition_type=row["condition_type"],
                    config=row.get("config", {}),
                )
                for row in conditions_data
            ]
        )

    def _reconcile_conditions(self, transition, conditions_data):
        existing = {str(c.id): c for c in transition.conditions.all()}
        seen_ids = set()
        for row in conditions_data:
            row_id = row.get("id")
            if row_id and str(row_id) in existing:
                obj = existing[str(row_id)]
                obj.condition_type = row.get("condition_type", obj.condition_type)
                obj.config = row.get("config", obj.config)
                obj.save(update_fields=["condition_type", "config"])
                seen_ids.add(str(row_id))
            else:
                WorkflowTransitionCondition.objects.create(
                    transition=transition,
                    condition_type=row["condition_type"],
                    config=row.get("config", {}),
                )
        for obj_id, obj in existing.items():
            if obj_id not in seen_ids:
                obj.delete()

    def _create_actions(self, transition, actions_data):
        WorkflowTransitionAction.objects.bulk_create(
            [
                WorkflowTransitionAction(
                    transition=transition,
                    action_type=row["action_type"],
                    config=row.get("config", {}),
                    sort_order=row.get("sort_order", index),
                )
                for index, row in enumerate(actions_data)
            ]
        )

    def _reconcile_actions(self, transition, actions_data):
        existing = {str(a.id): a for a in transition.actions.all()}
        seen_ids = set()
        for index, row in enumerate(actions_data):
            row_id = row.get("id")
            sort_order = row.get("sort_order", index)
            if row_id and str(row_id) in existing:
                obj = existing[str(row_id)]
                obj.action_type = row.get("action_type", obj.action_type)
                obj.config = row.get("config", obj.config)
                obj.sort_order = sort_order
                obj.save(update_fields=["action_type", "config", "sort_order"])
                seen_ids.add(str(row_id))
            else:
                WorkflowTransitionAction.objects.create(
                    transition=transition,
                    action_type=row["action_type"],
                    config=row.get("config", {}),
                    sort_order=sort_order,
                )
        for obj_id, obj in existing.items():
            if obj_id not in seen_ids:
                obj.delete()

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def list(self, request, slug, project_id):
        queryset = self.get_queryset()
        issue_type_id = request.GET.get("issue_type")
        if issue_type_id:
            queryset = queryset.filter(issue_type_id=issue_type_id)
        return Response(self.serializer_class(queryset, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def retrieve(self, request, slug, project_id, pk):
        transition = self.get_queryset().filter(pk=pk).first()
        if transition is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(transition).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        if WorkflowTransition.objects.filter(project_id=project_id).count() >= MAX_TRANSITIONS_PER_PROJECT:
            return Response(
                {"error": f"A project can have at most {MAX_TRANSITIONS_PER_PROJECT} workflow transitions"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data
        values = {
            "issue_type_id": data.get("issue_type"),
            "from_state_id": data.get("from_state"),
            "to_state_id": data.get("to_state"),
            "is_active": data.get("is_active", True),
        }
        error = _validate_transition_values(project, values)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        approvers_data = data.get("approvers", [])
        conditions_data = data.get("conditions", [])
        actions_data = data.get("actions", [])
        error = _validate_nested_payload(approvers_data, conditions_data, actions_data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            transition = WorkflowTransition.objects.create(
                project_id=project_id,
                workspace_id=project.workspace_id,
                issue_type_id=values["issue_type_id"],
                from_state_id=values["from_state_id"],
                to_state_id=values["to_state_id"],
                is_active=values["is_active"],
            )
        except IntegrityError:
            return Response(
                {"error": "A transition for this (issue type, from state, to state) already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self._create_approvers(transition, approvers_data)
        self._create_conditions(transition, conditions_data)
        self._create_actions(transition, actions_data)

        transition = self.get_queryset().filter(pk=transition.pk).first()
        return Response(self.serializer_class(transition).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def partial_update(self, request, slug, project_id, pk):
        transition = self.get_queryset().filter(pk=pk).first()
        if transition is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)

        project = transition.project
        data = request.data
        values = {
            "issue_type_id": data["issue_type"] if "issue_type" in data else transition.issue_type_id,
            "from_state_id": data["from_state"] if "from_state" in data else transition.from_state_id,
            "to_state_id": data["to_state"] if "to_state" in data else transition.to_state_id,
            "is_active": data.get("is_active", transition.is_active),
        }
        error = _validate_transition_values(project, values)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        approvers_data = data.get("approvers")
        conditions_data = data.get("conditions")
        actions_data = data.get("actions")
        error = _validate_nested_payload(approvers_data or [], conditions_data or [], actions_data or [])
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        for field, value in values.items():
            setattr(transition, field, value)
        try:
            transition.save()
        except IntegrityError:
            return Response(
                {"error": "A transition for this (issue type, from state, to state) already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if approvers_data is not None:
            self._reconcile_approvers(transition, approvers_data)
        if conditions_data is not None:
            self._reconcile_conditions(transition, conditions_data)
        if actions_data is not None:
            self._reconcile_actions(transition, actions_data)

        transition = self.get_queryset().filter(pk=transition.pk).first()
        return Response(self.serializer_class(transition).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def destroy(self, request, slug, project_id, pk):
        # Soft-delete (default `.delete()` behavior on any `AuditModel`
        # subclass - see plane/db/mixins.py::SoftDeleteModel) - exigence 17
        # ("désactiver... sans suppression, afin de conserver l'historique")
        # is served by `is_active` for day-to-day toggling; an outright
        # DELETE here still preserves the row (and every
        # `WorkflowTransitionAuditLog`/`IssueTransitionApprovalRequest` that
        # references it, since those FKs aren't CASCADE) for audit purposes.
        transition = WorkflowTransition.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if transition is not None:
            transition.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowTransitionApproverEndpoint(BaseAPIView):
    """Granular add/remove for a single approver row - see
    `WorkflowTransitionViewSet`'s docstring for why this exists alongside
    the PATCH-based nested reconciliation."""

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        transition = WorkflowTransition.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if transition is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)
        error = _validate_nested_payload([request.data], [], [])
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        if transition.approvers.count() >= MAX_TRANSITIONS_PER_PROJECT:
            return Response({"error": "Too many approvers on this transition"}, status=status.HTTP_400_BAD_REQUEST)
        approver = WorkflowTransitionApprover.objects.create(
            transition=transition,
            member_id=request.data.get("member"),
            role=request.data.get("role"),
            approval_required=request.data.get("approval_required", False),
        )

        return Response(WorkflowTransitionApproverSerializer(approver).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def delete(self, request, slug, project_id, pk, approver_id):
        WorkflowTransitionApprover.objects.filter(
            transition_id=pk, transition__workspace__slug=slug, transition__project_id=project_id, pk=approver_id
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowTransitionConditionEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        transition = WorkflowTransition.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if transition is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)
        error = _validate_nested_payload([], [request.data], [])
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        if transition.conditions.count() >= MAX_CONDITIONS_PER_TRANSITION:
            return Response(
                {"error": f"A transition can have at most {MAX_CONDITIONS_PER_TRANSITION} conditions"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        condition = WorkflowTransitionCondition.objects.create(
            transition=transition,
            condition_type=request.data["condition_type"],
            config=request.data.get("config", {}),
        )

        return Response(WorkflowTransitionConditionSerializer(condition).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def delete(self, request, slug, project_id, pk, condition_id):
        WorkflowTransitionCondition.objects.filter(
            transition_id=pk, transition__workspace__slug=slug, transition__project_id=project_id, pk=condition_id
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowTransitionActionEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        transition = WorkflowTransition.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if transition is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)
        error = _validate_nested_payload([], [], [request.data])
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        if transition.actions.count() >= MAX_ACTIONS_PER_TRANSITION:
            return Response(
                {"error": f"A transition can have at most {MAX_ACTIONS_PER_TRANSITION} actions"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        action = WorkflowTransitionAction.objects.create(
            transition=transition,
            action_type=request.data["action_type"],
            config=request.data.get("config", {}),
            sort_order=request.data.get("sort_order", transition.actions.count()),
        )

        return Response(WorkflowTransitionActionSerializer(action).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def delete(self, request, slug, project_id, pk, action_id):
        WorkflowTransitionAction.objects.filter(
            transition_id=pk, transition__workspace__slug=slug, transition__project_id=project_id, pk=action_id
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowTransitionAuditLogEndpoint(BaseAPIView):
    """Admin-only project-wide log of every evaluated attempt (allowed,
    denied, pending_approval) - exigence 12's "consultable par les Admins
    du projet". Not explicitly named as its own endpoint in the spec's own
    endpoint list, but exigence 12 requires the log be consultable
    somehow, and every other log-shaped feature this category has built
    (`WorkflowRuleExecutionLogEndpoint`, SLA's compliance report) exposes
    one - this mirrors that same paginated-list convention."""

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def get(self, request, slug, project_id):
        logs = WorkflowTransitionAuditLog.objects.filter(
            issue__workspace__slug=slug, issue__project_id=project_id
        ).select_related("issue", "transition", "actor", "from_state", "to_state")

        issue_id = request.GET.get("issue_id")
        if issue_id:
            logs = logs.filter(issue_id=issue_id)
        outcome = request.GET.get("outcome")
        if outcome:
            logs = logs.filter(outcome=outcome.upper())

        return self.paginate(
            request=request,
            order_by=request.GET.get("order_by", "-created_at"),
            queryset=logs,
            on_results=lambda rows: WorkflowTransitionAuditLogSerializer(rows, many=True).data,
        )


class IssueAllowedTransitionsEndpoint(BaseAPIView):
    """
    `GET .../issues/:issue_id/allowed-transitions/` - read-only, any
    project member (exigence 4: the state-picker UI needs this for every
    viewer, not just Admins). Calls `evaluate_transition` once per `State`
    in the issue's project, `log_audit=False` (see
    plane/utils/workflow_transition_engine.py's module docstring for why a
    capability probe isn't the same thing as a logged attempt).
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, issue_id):
        issue = (
            Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
            .select_related("state", "type", "project")
            .first()
        )
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        states = State.objects.filter(project_id=project_id)  # default manager excludes triage states
        results = []
        for state in states:
            result = evaluate_transition(issue, state, request.user, log_audit=False)
            entry = {"state_id": str(state.id)}
            if result["outcome"] == "allowed":
                entry["allowed"] = True
            elif result["outcome"] == "pending_approval":
                entry["allowed"] = False
                entry["reason_code"] = "APPROVAL_REQUIRED"
                entry["reason"] = "This transition requires approval before it takes effect."
            else:
                entry["allowed"] = False
                entry["reason_code"] = result["reason"]["code"]
                entry["reason"] = result["reason"]["message"]
            results.append(entry)

        return Response(results, status=status.HTTP_200_OK)


class IssueTransitionRequestApprovalEndpoint(BaseAPIView):
    """
    `POST .../issues/:issue_id/transitions/:transition_id/request-approval/`
    - re-validates server-side (never trusts the client) that
    `evaluate_transition` currently returns `pending_approval` for this
    exact (issue, transition, calling user) before creating the
    `IssueTransitionApprovalRequest`.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def post(self, request, slug, project_id, issue_id, transition_id):
        issue = (
            Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id)
            .select_related("state", "type", "project")
            .first()
        )
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        transition = WorkflowTransition.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=transition_id, is_active=True
        ).select_related("to_state").first()
        if transition is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)

        existing_pending = IssueTransitionApprovalRequest.objects.filter(
            issue_id=issue.id, transition_id=transition.id, status="PENDING"
        ).first()
        if existing_pending is not None:
            return Response(
                IssueTransitionApprovalRequestSerializer(existing_pending).data, status=status.HTTP_200_OK
            )

        result = evaluate_transition(issue, transition.to_state, request.user)
        transition_matches = result["transition"] is not None and result["transition"].id == transition.id
        if result["outcome"] != "pending_approval" or not transition_matches:
            return Response(
                {
                    "error": "This transition does not currently require your approval request.",
                    "outcome": result["outcome"],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        approval_request = create_approval_request(issue, transition, request.user)
        return Response(IssueTransitionApprovalRequestSerializer(approval_request).data, status=status.HTTP_201_CREATED)


def _decide_approval(request, slug, project_id, pk, decision):
    approval_request = (
        IssueTransitionApprovalRequest.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk)
        .select_related("transition", "transition__to_state", "issue")
        .first()
    )
    if approval_request is None:
        return Response({"error": "Approval request not found"}, status=status.HTTP_404_NOT_FOUND)

    if approval_request.status != "PENDING":
        return Response(
            {"error": f"This request has already been {approval_request.status.lower()}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not can_approve_transition(request.user, approval_request.transition, project_id):
        return Response(
            {"error": "You are not a valid approver for this transition."}, status=status.HTTP_403_FORBIDDEN
        )

    comment = request.data.get("comment", "")
    approve_transition_request(approval_request, request.user, decision, comment)

    approval_request = (
        IssueTransitionApprovalRequest.objects.filter(pk=approval_request.pk)
        .select_related("transition", "issue")
        .first()
    )
    return Response(IssueTransitionApprovalRequestSerializer(approval_request).data, status=status.HTTP_200_OK)


class IssueTransitionApprovalApproveEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        return _decide_approval(request, slug, project_id, pk, "APPROVED")


class IssueTransitionApprovalRejectEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        return _decide_approval(request, slug, project_id, pk, "REJECTED")
