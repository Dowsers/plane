# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.space.views import (
    DashboardPublicEndpoint,
    DashboardWidgetPublicDataEndpoint,
)

urlpatterns = [
    path(
        "dashboards/<str:anchor>/",
        DashboardPublicEndpoint.as_view(),
        name="dashboard-public",
    ),
    path(
        "dashboards/<str:anchor>/widgets/<uuid:widget_id>/data/",
        DashboardWidgetPublicDataEndpoint.as_view(),
        name="dashboard-widget-public-data",
    ),
]
