# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssueSLAEndpoint,
    SLAPolicyDuplicateEndpoint,
    SLAPolicyViewSet,
    SLAReportEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/sla-policies/",
        SLAPolicyViewSet.as_view({"get": "list", "post": "create"}),
        name="sla-policy",
    ),
    path(
        "workspaces/<str:slug>/sla-policies/<uuid:pk>/",
        SLAPolicyViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="sla-policy",
    ),
    path(
        "workspaces/<str:slug>/sla-policies/<uuid:pk>/duplicate/",
        SLAPolicyDuplicateEndpoint.as_view(),
        name="sla-policy-duplicate",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/sla/",
        IssueSLAEndpoint.as_view(),
        name="issue-sla",
    ),
    path(
        "workspaces/<str:slug>/sla-report/",
        SLAReportEndpoint.as_view(),
        name="sla-report",
    ),
]
