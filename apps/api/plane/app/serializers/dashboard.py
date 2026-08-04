# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from .issue import LabelLiteSerializer
from .project import ProjectLiteSerializer
from .state import StateLiteSerializer
from .user import UserLiteSerializer
from plane.db.models import Dashboard, DashboardWidget, DeployBoard, Issue


class DashboardWidgetSerializer(BaseSerializer):
    class Meta:
        model = DashboardWidget
        fields = "__all__"
        read_only_fields = ["workspace", "project", "dashboard", "sort_order"]


class DashboardSerializer(BaseSerializer):
    owned_by_detail = UserLiteSerializer(source="owned_by", read_only=True)
    # Ordered (Meta.ordering = ("sort_order", "created_at") on the model)
    # config/layout for every widget on this dashboard - never their
    # computed data, see `plane.app.views.dashboard.data`.
    widgets = DashboardWidgetSerializer(many=True, read_only=True)
    # Computed from the `DeployBoard` row (if any) with
    # entity_name="dashboard" - see `plane.app.views.dashboard.publish`.
    # Surfaced here so the frontend can render publish state on the normal
    # list/retrieve calls without a dedicated GET on `.../publish/`.
    anchor = serializers.SerializerMethodField()
    is_published = serializers.SerializerMethodField()

    class Meta:
        model = Dashboard
        fields = "__all__"
        read_only_fields = ["workspace", "project", "owned_by", "widgets", "anchor", "is_published"]

    def _deploy_board(self, obj):
        if not hasattr(obj, "_dashboard_deploy_board"):
            obj._dashboard_deploy_board = DeployBoard.objects.filter(
                entity_name="dashboard", entity_identifier=obj.id
            ).first()
        return obj._dashboard_deploy_board

    def get_anchor(self, obj):
        deploy_board = self._deploy_board(obj)
        return deploy_board.anchor if deploy_board else None

    def get_is_published(self, obj):
        deploy_board = self._deploy_board(obj)
        return bool(deploy_board and not deploy_board.is_disabled)


class DashboardWidgetTableIssueSerializer(BaseSerializer):
    """Read-only row shape for the `table` widget type's paginated results
    - see docs/feature-specs/05-insights-analytics.md, section 3,
    exigence 6. Reused as-is by the public widget-data endpoint
    (`plane.space.views.dashboard`) - same precedent as
    `ProjectIssuesPublicEndpoint` importing comment/reaction/vote
    serializers straight from `plane.app.serializers`."""

    project_detail = ProjectLiteSerializer(source="project", read_only=True)
    state_detail = StateLiteSerializer(source="state", read_only=True)
    assignee_details = UserLiteSerializer(source="assignees", many=True, read_only=True)
    label_details = LabelLiteSerializer(source="labels", many=True, read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "sequence_id",
            "project_id",
            "project_detail",
            "state_id",
            "state_detail",
            "priority",
            "assignee_details",
            "label_details",
            "target_date",
            "created_at",
        ]
        read_only_fields = fields
