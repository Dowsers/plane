# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Governed multi-state workflows - see
docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernés
multi-états avec approbations", section 4) in plane-selfhost. Read-mostly
serializers, mirroring WorkflowRuleSerializer's (workflow_rule.py) nested-
list-of-dicts style - the viewset (app/views/workflow_transition/base.py)
reconciles the nested `approvers`/`conditions`/`actions` collections
manually on write, the same established convention as
WorkflowRuleViewSet._reconcile_actions, rather than relying on DRF's
writable-nested-serializer machinery.
"""

from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import (
    IssueTransitionApproval,
    IssueTransitionApprovalRequest,
    WorkflowTransition,
    WorkflowTransitionAction,
    WorkflowTransitionApprover,
    WorkflowTransitionAuditLog,
    WorkflowTransitionCondition,
)


class WorkflowTransitionApproverSerializer(BaseSerializer):
    class Meta:
        model = WorkflowTransitionApprover
        fields = ["id", "member", "role", "approval_required"]
        read_only_fields = ["id"]


class WorkflowTransitionConditionSerializer(BaseSerializer):
    class Meta:
        model = WorkflowTransitionCondition
        fields = ["id", "condition_type", "config"]
        read_only_fields = ["id"]


class WorkflowTransitionActionSerializer(BaseSerializer):
    class Meta:
        model = WorkflowTransitionAction
        fields = ["id", "action_type", "config", "sort_order"]
        read_only_fields = ["id"]


class WorkflowTransitionSerializer(BaseSerializer):
    approvers = WorkflowTransitionApproverSerializer(many=True, required=False)
    conditions = WorkflowTransitionConditionSerializer(many=True, required=False)
    actions = WorkflowTransitionActionSerializer(many=True, required=False)

    class Meta:
        model = WorkflowTransition
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "issue_type",
            "from_state",
            "to_state",
            "is_active",
            "approvers",
            "conditions",
            "actions",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "workspace_id", "project_id", "created_at", "updated_at", "created_by"]

    def validate(self, attrs):
        # `to_state` is the only field with no per-project sentinel meaning
        # (unlike `from_state`/`issue_type` where `null` is meaningful) -
        # required at the serializer level for the same reason the model's
        # own FK is non-nullable. NOTE (same disclosure as
        # WorkflowRuleSerializer.validate_actions's own docstring): the
        # viewset (app/views/workflow_transition/base.py) creates/updates
        # `WorkflowTransition` rows manually (`.objects.create()`/direct
        # `setattr`), not via `serializer.save()`, so this only actually
        # fires if this serializer is ever used to validate input
        # directly - `_validate_transition_values` in the viewset is what
        # enforces this same rule on the real request path today.
        if self.instance is None and attrs.get("to_state") is None:
            raise serializers.ValidationError({"to_state": "This field is required."})
        return attrs


class IssueTransitionApprovalSerializer(BaseSerializer):
    class Meta:
        model = IssueTransitionApproval
        fields = ["id", "approval_request", "approver", "decision", "comment", "responded_at"]
        read_only_fields = fields


class IssueTransitionApprovalRequestSerializer(BaseSerializer):
    approvals = IssueTransitionApprovalSerializer(many=True, read_only=True)

    class Meta:
        model = IssueTransitionApprovalRequest
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "issue",
            "transition",
            "requested_by",
            "status",
            "approvals",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class WorkflowTransitionAuditLogSerializer(BaseSerializer):
    class Meta:
        model = WorkflowTransitionAuditLog
        fields = [
            "id",
            "issue",
            "transition",
            "actor",
            "from_state",
            "to_state",
            "outcome",
            "denial_reason",
            "created_at",
        ]
        read_only_fields = fields
