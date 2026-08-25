# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import WorkspaceSyncAccessibleIdsEndpoint, WorkspaceSyncEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/sync/",
        WorkspaceSyncEndpoint.as_view(),
        name="workspace-sync",
    ),
    path(
        "workspaces/<str:slug>/sync/accessible-ids/",
        WorkspaceSyncAccessibleIdsEndpoint.as_view(),
        name="workspace-sync-accessible-ids",
    ),
]
