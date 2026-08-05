# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import IssueSLA, SLAPolicy

from .base import BaseSerializer


class SLAPolicySerializer(BaseSerializer):
    """Read/output shape for `SLAPolicy`. `project_ids`/`label_ids`/
    `assignee_ids` are read-only here - the view applies writes to the
    underlying M2M fields directly (same manual-reconciliation convention
    `WorkflowRuleViewSet` already uses for its own nested `actions`), since
    a plain `PrimaryKeyRelatedField(many=True)` write would silently accept
    ids from other workspaces without the cross-workspace validation the
    view performs."""

    project_ids = serializers.PrimaryKeyRelatedField(source="projects", many=True, read_only=True)
    label_ids = serializers.PrimaryKeyRelatedField(source="labels", many=True, read_only=True)
    assignee_ids = serializers.PrimaryKeyRelatedField(source="assignees", many=True, read_only=True)

    class Meta:
        model = SLAPolicy
        fields = [
            "id",
            "workspace",
            "name",
            "description",
            "project_ids",
            "applies_to_all_projects",
            "priority_filter",
            "label_ids",
            "assignee_ids",
            "state_group_filter",
            "response_time_minutes",
            "resolution_time_minutes",
            "warning_threshold_percent",
            "critical_threshold_percent",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "project_ids",
            "label_ids",
            "assignee_ids",
            "created_at",
            "updated_at",
            "created_by",
        ]


class IssueSLASerializer(BaseSerializer):
    sla_policy_name = serializers.CharField(source="sla_policy.name", read_only=True, default=None)

    class Meta:
        model = IssueSLA
        fields = [
            "id",
            "issue",
            "project",
            "sla_policy",
            "sla_policy_name",
            "sla_type",
            "due_at",
            "met_at",
            "status",
            "breached_at",
            "last_notified_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
