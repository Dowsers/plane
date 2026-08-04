# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import Dashboard, DashboardWidget


class DashboardWidgetPublicSerializer(BaseSerializer):
    """Config/layout only, never computed data - see
    `DashboardPublicEndpoint`."""

    class Meta:
        model = DashboardWidget
        fields = ["id", "widget_type", "title", "config", "project_ids", "position", "sort_order"]
        read_only_fields = fields


class DashboardPublicSerializer(BaseSerializer):
    widgets = DashboardWidgetPublicSerializer(many=True, read_only=True)

    class Meta:
        model = Dashboard
        fields = ["id", "name", "description", "logo_props", "widgets", "created_at", "updated_at"]
        read_only_fields = fields


# The `table` widget type's paginated row shape is read-only and carries no
# public/private field divergence, so the public widget-data endpoint
# reuses `plane.app.serializers.DashboardWidgetTableIssueSerializer`
# directly - the same "space imports a serializer straight from plane.app"
# precedent already used by `ProjectIssuesPublicEndpoint`
# (`plane/space/views/issue.py`) for comment/reaction/vote serializers.
