# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import DashboardSerializer, DashboardWidgetSerializer
from plane.db.models import Dashboard, DashboardWidget, Project, Workspace
from ..base import BaseAPIView, BaseViewSet

# A dashboard can have at most this many widgets, to avoid overloaded pages
# - see docs/feature-specs/05-insights-analytics.md, section 3, exigence 7.
# A plain module-level constant (not a per-workspace configurable setting) -
# same shape as `ComplexFilterBackend.default_max_conditions` elsewhere in
# this codebase, there's no precedent for making a limit like this
# admin-editable.
DEFAULT_MAX_DASHBOARD_WIDGETS = 20


def _invalid_project_ids(slug, project_ids):
    """Every id in `project_ids` must be a real, non-deleted project in this
    workspace - the AUTHOR submitting a widget is rejected outright with a
    400 listing the bad ids (as opposed to the VIEWER-time silent exclusion
    of projects they personally can't see - see
    `plane.utils.date_utils.get_analytics_filters`/
    `get_public_analytics_filters`, used only at widget-data read time)."""
    if not project_ids:
        return []
    project_ids = [str(project_id) for project_id in project_ids]
    existing_ids = set(
        str(project_id)
        for project_id in Project.objects.filter(
            workspace__slug=slug, id__in=project_ids, deleted_at__isnull=True
        ).values_list("id", flat=True)
    )
    return [project_id for project_id in project_ids if project_id not in existing_ids]


class DashboardViewSet(BaseViewSet):
    serializer_class = DashboardSerializer
    model = Dashboard

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("owned_by", "created_by")
            .prefetch_related("widgets")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        dashboards = self.get_queryset()
        return Response(DashboardSerializer(dashboards, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = DashboardSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        # `owned_by` is set equal to `created_by` at creation time - see
        # `plane.db.models.dashboard.Dashboard` docstring. `BaseModel.save`
        # already sets `created_by` from the current user automatically.
        dashboard = serializer.save(workspace_id=workspace.id, owned_by=request.user)
        dashboard = self.get_queryset().filter(pk=dashboard.pk).first()
        return Response(DashboardSerializer(dashboard).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        dashboard = self.get_queryset().filter(pk=pk).first()
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(DashboardSerializer(dashboard).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def partial_update(self, request, slug, pk):
        dashboard = Dashboard.objects.filter(workspace__slug=slug, pk=pk).first()
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = DashboardSerializer(dashboard, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        dashboard = self.get_queryset().filter(pk=dashboard.pk).first()
        return Response(DashboardSerializer(dashboard).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def destroy(self, request, slug, pk):
        dashboard = Dashboard.objects.filter(workspace__slug=slug, pk=pk).first()
        if dashboard is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        dashboard.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DashboardWidgetViewSet(BaseViewSet):
    """Nested under a dashboard - `pk` in every method here is the *parent
    dashboard's* id (not the widget's own id) so that
    `allow_permission(..., creator=True, model=Dashboard)` can be reused
    unmodified (it looks up `Dashboard.objects.filter(id=kwargs["pk"], ...)`)
    - the widget's own id is `widget_id`. This only affects Django's
    internal URL-kwarg names, not the actual URL path."""

    serializer_class = DashboardWidgetSerializer
    model = DashboardWidget

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def create(self, request, slug, pk):
        dashboard = Dashboard.objects.filter(workspace__slug=slug, pk=pk).first()
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)

        current_widget_count = DashboardWidget.objects.filter(dashboard=dashboard).count()
        if current_widget_count >= DEFAULT_MAX_DASHBOARD_WIDGETS:
            return Response(
                {"error": f"A dashboard can have at most {DEFAULT_MAX_DASHBOARD_WIDGETS} widgets"},
                status=status.HTTP_409_CONFLICT,
            )

        invalid_project_ids = _invalid_project_ids(slug, request.data.get("project_ids"))
        if invalid_project_ids:
            return Response(
                {
                    "error": "Some project_ids do not exist in this workspace",
                    "invalid_project_ids": invalid_project_ids,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DashboardWidgetSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        widget = serializer.save(dashboard=dashboard, workspace_id=dashboard.workspace_id)
        return Response(DashboardWidgetSerializer(widget).data, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def partial_update(self, request, slug, pk, widget_id):
        widget = DashboardWidget.objects.filter(workspace__slug=slug, dashboard_id=pk, pk=widget_id).first()
        if widget is None:
            return Response({"error": "Widget not found"}, status=status.HTTP_404_NOT_FOUND)

        if "project_ids" in request.data:
            invalid_project_ids = _invalid_project_ids(slug, request.data.get("project_ids"))
            if invalid_project_ids:
                return Response(
                    {
                        "error": "Some project_ids do not exist in this workspace",
                        "invalid_project_ids": invalid_project_ids,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = DashboardWidgetSerializer(widget, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(DashboardWidgetSerializer(widget).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def destroy(self, request, slug, pk, widget_id):
        widget = DashboardWidget.objects.filter(workspace__slug=slug, dashboard_id=pk, pk=widget_id).first()
        if widget is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        widget.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DashboardWidgetReorderEndpoint(BaseAPIView):
    """Batch update of `position`/`sort_order` for multiple widgets in one
    call - the drag-and-drop save action - see
    docs/feature-specs/05-insights-analytics.md, section 3, exigence 8.

    Request body: {"widgets": [{"id": "<uuid>", "position": {"x":0,"y":0,
    "w":4,"h":3}, "sort_order": 20000}, ...]}. `position` and `sort_order`
    are both optional per item (only the provided ones are updated); any
    id not belonging to this dashboard is silently ignored.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def post(self, request, slug, pk):
        dashboard = Dashboard.objects.filter(workspace__slug=slug, pk=pk).first()
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)

        widgets_payload = request.data.get("widgets", [])
        if not isinstance(widgets_payload, list) or not widgets_payload:
            return Response({"error": "widgets must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        widgets_by_id = {
            str(widget.id): widget
            for widget in DashboardWidget.objects.filter(
                dashboard=dashboard, id__in=[item.get("id") for item in widgets_payload if item.get("id")]
            )
        }

        updated = []
        for item in widgets_payload:
            widget = widgets_by_id.get(str(item.get("id")))
            if widget is None:
                continue
            if "position" in item:
                widget.position = item["position"]
            if "sort_order" in item:
                widget.sort_order = item["sort_order"]
            updated.append(widget)

        if updated:
            DashboardWidget.objects.bulk_update(updated, ["position", "sort_order"], batch_size=100)

        widgets = DashboardWidget.objects.filter(dashboard=dashboard)
        return Response(DashboardWidgetSerializer(widgets, many=True).data, status=status.HTTP_200_OK)
