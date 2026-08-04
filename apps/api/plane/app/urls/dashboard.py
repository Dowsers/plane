# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    DashboardViewSet,
    DashboardWidgetViewSet,
    DashboardWidgetReorderEndpoint,
    DashboardWidgetDataEndpoint,
    DashboardPublishEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/dashboards/",
        DashboardViewSet.as_view({"get": "list", "post": "create"}),
        name="dashboard",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/",
        DashboardViewSet.as_view(
            {
                "get": "retrieve",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="dashboard",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/widgets/",
        DashboardWidgetViewSet.as_view({"post": "create"}),
        name="dashboard-widget",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/widgets/reorder/",
        DashboardWidgetReorderEndpoint.as_view(),
        name="dashboard-widget-reorder",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/widgets/<uuid:widget_id>/",
        DashboardWidgetViewSet.as_view(
            {
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="dashboard-widget",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/widgets/<uuid:widget_id>/data/",
        DashboardWidgetDataEndpoint.as_view(),
        name="dashboard-widget-data",
    ),
    path(
        "workspaces/<str:slug>/dashboards/<uuid:pk>/publish/",
        DashboardPublishEndpoint.as_view(),
        name="dashboard-publish",
    ),
]
