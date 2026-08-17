# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    AgentProfileViewSet,
    AgentTokenListCreateEndpoint,
    AgentTokenRevokeEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/agents/",
        AgentProfileViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-agent",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:pk>/",
        AgentProfileViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-agent",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:agent_id>/tokens/",
        AgentTokenListCreateEndpoint.as_view(),
        name="workspace-agent-token",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:agent_id>/tokens/<uuid:token_id>/revoke/",
        AgentTokenRevokeEndpoint.as_view(),
        name="workspace-agent-token-revoke",
    ),
]
