# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    ProjectDuplicateDetectionConfigEndpoint,
    WorkspaceDuplicateDetectionConfigEndpoint,
    WorkspaceDuplicateDetectionBackfillEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/duplicate-detection-config/",
        ProjectDuplicateDetectionConfigEndpoint.as_view(),
        name="project-duplicate-detection-config",
    ),
    path(
        "workspaces/<str:slug>/duplicate-detection-config/",
        WorkspaceDuplicateDetectionConfigEndpoint.as_view(),
        name="workspace-duplicate-detection-config",
    ),
    path(
        "workspaces/<str:slug>/duplicate-detection-config/backfill/",
        WorkspaceDuplicateDetectionBackfillEndpoint.as_view(),
        name="workspace-duplicate-detection-config-backfill",
    ),
]
