# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    FigmaFileLinkListCreateAPIEndpoint,
    FigmaFileLinkDetailAPIEndpoint,
    FigmaStatusBatchAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/figma-links/",
        FigmaFileLinkListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="figma-link",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/figma-links/<uuid:pk>/",
        FigmaFileLinkDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="figma-link",
    ),
    path(
        "workspaces/<str:slug>/figma/status-batch/",
        FigmaStatusBatchAPIEndpoint.as_view(http_method_names=["get"]),
        name="figma-status-batch",
    ),
]
