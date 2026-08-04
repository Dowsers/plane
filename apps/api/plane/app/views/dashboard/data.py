# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import DashboardWidgetTableIssueSerializer
from plane.db.models import DashboardWidget
from plane.utils.dashboard_widget import build_table_widget_queryset, compute_widget_data
from plane.utils.date_utils import get_analytics_filters
from ..base import BaseAPIView


class DashboardWidgetDataEndpoint(BaseAPIView):
    """Computed data for a single widget - see
    docs/feature-specs/05-insights-analytics.md, section 3, exigences 3-6.

    Any active workspace member can read this (not owner/admin-gated -
    viewing a dashboard is not the same permission as editing it).
    Deliberately reuses `get_analytics_filters` unmodified (the same
    membership-scoped trust model as every other authenticated analytics
    endpoint in this codebase, e.g. `AdvanceAnalyticsBaseView`) - any
    project in the widget's own `project_ids` that this particular
    requesting user can't see is silently excluded from the computed
    result (exigence 3), without erroring.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk, widget_id):
        widget = DashboardWidget.objects.filter(workspace__slug=slug, dashboard_id=pk, pk=widget_id).first()
        if widget is None:
            return Response({"error": "Widget not found"}, status=status.HTTP_404_NOT_FOUND)

        filters = get_analytics_filters(
            slug=slug,
            user=request.user,
            type="chart",
            project_ids=[str(project_id) for project_id in widget.project_ids],
        )

        if widget.widget_type == "table":
            queryset = build_table_widget_queryset(widget, filters)
            return self.paginate(
                request=request,
                queryset=queryset,
                on_results=lambda issues: DashboardWidgetTableIssueSerializer(issues, many=True).data,
            )

        data = compute_widget_data(widget, filters)
        return Response(data, status=status.HTTP_200_OK)
