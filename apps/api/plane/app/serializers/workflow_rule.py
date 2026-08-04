# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import WorkflowAction, WorkflowRule, WorkflowRuleExecutionLog


class WorkflowActionSerializer(BaseSerializer):
    class Meta:
        model = WorkflowAction
        fields = ["id", "action_type", "action_config", "sort_order"]
        read_only_fields = ["id"]


class WorkflowRuleSerializer(BaseSerializer):
    actions = WorkflowActionSerializer(many=True, required=False)

    class Meta:
        model = WorkflowRule
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "name",
            "description",
            "is_active",
            "trigger_type",
            "trigger_config",
            "conditions",
            "execution_count",
            "last_triggered_at",
            "actions",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "workspace_id",
            "project_id",
            "execution_count",
            "last_triggered_at",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def validate_actions(self, value):
        # Saving a rule with zero actions must fail - exigence 2 de
        # docs/feature-specs/06-automation-workflow-sla.md ("Moteur de
        # regles d'automatisation") in plane-selfhost. This is exercised
        # whenever the serializer itself is used to validate input; the
        # viewset (mirroring TriageRuleViewSet's established convention)
        # additionally enforces the same rule directly on the request
        # payload before touching the database, since rule + nested actions
        # are created/reconciled manually rather than through
        # serializer.save().
        if value is not None and len(value) == 0:
            raise serializers.ValidationError("A workflow rule must have at least one action.")
        return value


class WorkflowRuleExecutionLogSerializer(BaseSerializer):
    class Meta:
        model = WorkflowRuleExecutionLog
        fields = [
            "id",
            "rule",
            "issue",
            "trigger_event",
            "status",
            "actions_applied",
            "error_message",
            "chain_depth",
            "executed_at",
        ]
        read_only_fields = fields
