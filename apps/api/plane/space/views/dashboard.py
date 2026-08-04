# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

# Module imports
from plane.app.serializers import DashboardWidgetTableIssueSerializer
from plane.db.models import Dashboard, DashboardWidget, DeployBoard
from plane.space.serializer.dashboard import DashboardPublicSerializer
from plane.utils.dashboard_widget import build_table_widget_queryset, compute_widget_data
from plane.utils.date_utils import get_public_analytics_filters
from .base import BaseAPIView


class DashboardWidgetPublicDataThrottle(SimpleRateThrottle):
    """
    Rate limited per (anchor, IP) pair - see
    docs/feature-specs/05-insights-analytics.md, section 3, exigences 9-10.
    Only applied to the widget-data endpoint below, not the cheap metadata
    one (`DashboardPublicEndpoint`, unthrottled) - this is the one that
    runs a real DB aggregation per call. This is abuse/scraping protection
    on a single public link, not an access-control boundary - anyone
    holding the anchor can view the dashboard by design (exigence 9).

    Mirrors `IntakeFormSubmitThrottle`
    (`plane/space/views/intake_form.py`) / `NLFilterAssistantThrottle`
    (`plane/app/views/view/nl_filter_assistant.py`) for the same reason:
    `SimpleRateThrottle.parse_rate()` only reads a single leading
    digit+unit character (s/m/h/d), so there's no built-in syntax for
    "N per minute" - `num_requests`/`duration` are set directly in
    `allow_request` instead of via `scope`/settings.
    """

    scope = "dashboard_widget_public_data"

    def get_cache_key(self, request, view):
        anchor = view.kwargs.get("anchor")
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": f"{anchor}:{ident}"}

    def allow_request(self, request, view):
        # 60/minute per (anchor, IP) - generous enough for a full page load
        # of a widget-capped (<=20) dashboard plus manual refreshes, while
        # still bounding the per-anchor aggregation query rate.
        self.num_requests, self.duration = 60, 60
        return super().allow_request(request, view)


def _get_published_dashboard_board(anchor):
    """`None` if the anchor doesn't resolve to a currently-published
    dashboard - covers both "never published"/"unpublished" (the
    `DeployBoard` row is gone, soft-deleted by `DashboardPublishEndpoint.
    delete`) and "explicitly disabled" (`is_disabled=True`, unused by this
    feature today but checked defensively, same as every other public
    entity endpoint in this module)."""
    deploy_board = DeployBoard.objects.filter(anchor=anchor, entity_name="dashboard").first()
    if deploy_board is None or deploy_board.is_disabled:
        return None
    return deploy_board


class DashboardPublicEndpoint(BaseAPIView):
    """Dashboard metadata + its widgets' config/layout - deliberately NOT
    their computed data, to keep this endpoint cheap - see
    docs/feature-specs/05-insights-analytics.md, section 3, exigence 9.
    """

    permission_classes = [AllowAny]

    def get(self, request, anchor):
        deploy_board = _get_published_dashboard_board(anchor)
        if deploy_board is None:
            return Response({"error": "Dashboard is not published"}, status=status.HTTP_404_NOT_FOUND)

        dashboard = (
            Dashboard.objects.filter(id=deploy_board.entity_identifier).prefetch_related("widgets").first()
        )
        if dashboard is None:
            return Response({"error": "Dashboard is not published"}, status=status.HTTP_404_NOT_FOUND)

        return Response(DashboardPublicSerializer(dashboard).data, status=status.HTTP_200_OK)


class DashboardWidgetPublicDataEndpoint(BaseAPIView):
    """Computed data for a single widget on a published dashboard - no
    authentication, no membership check at all (exigence 9-10): scope is
    resolved entirely from the looked-up `DeployBoard` row and the
    widget's own stored `project_ids`, exactly like every other public
    (`AllowAny`) endpoint in this module (e.g. `ProjectIssuesPublicEndpoint`
    in `plane/space/views/issue.py`). Uses `get_public_analytics_filters`
    (never `get_analytics_filters`, which always requires a real member
    user) - see `plane.utils.date_utils` module docstring for the full
    rationale.
    """

    permission_classes = [AllowAny]
    throttle_classes = [DashboardWidgetPublicDataThrottle]

    def get(self, request, anchor, widget_id):
        deploy_board = _get_published_dashboard_board(anchor)
        if deploy_board is None:
            return Response({"error": "Dashboard is not published"}, status=status.HTTP_404_NOT_FOUND)

        widget = DashboardWidget.objects.filter(dashboard_id=deploy_board.entity_identifier, pk=widget_id).first()
        if widget is None:
            return Response({"error": "Widget not found"}, status=status.HTTP_404_NOT_FOUND)

        filters = get_public_analytics_filters(
            workspace_id=deploy_board.workspace_id,
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
