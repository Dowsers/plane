# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import WorkspaceAIConfigEndpoint, WorkspaceAIConfigTestEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/ai-config/",
        WorkspaceAIConfigEndpoint.as_view(),
        name="workspace-ai-config",
    ),
    path(
        "workspaces/<str:slug>/ai-config/test/",
        WorkspaceAIConfigTestEndpoint.as_view(),
        name="workspace-ai-config-test",
    ),
]
