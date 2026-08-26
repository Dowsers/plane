# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.workspace.teamspace import (
    WorkspaceTeamspacesEndpoint,
    WorkspaceTeamspaceMembersEndpoint,
    WorkspaceTeamspaceProjectsEndpoint,
    WorkspaceTeamspaceOverviewEndpoint,
    WorkspaceTeamspaceCyclesEndpoint,
    WorkspaceTeamspaceRelationsEndpoint,
    WorkspaceTeamspaceStatsEndpoint,
    WorkspaceTeamspacePagesEndpoint,
    WorkspaceTeamspaceViewsEndpoint,
)

urlpatterns = [
    # Teamspace CRUD
    path(
        "workspaces/<str:slug>/teamspaces/",
        WorkspaceTeamspacesEndpoint.as_view({"get": "list", "post": "create"}),
        name="workspace-teamspaces",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:pk>/",
        WorkspaceTeamspacesEndpoint.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-teamspace-detail",
    ),
    # Teamspace Members
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/members/",
        WorkspaceTeamspaceMembersEndpoint.as_view(),
        name="workspace-teamspace-members",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/members/<uuid:member_id>/",
        WorkspaceTeamspaceMembersEndpoint.as_view(),
        name="workspace-teamspace-member-detail",
    ),
    # Teamspace Projects
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/projects/",
        WorkspaceTeamspaceProjectsEndpoint.as_view(),
        name="workspace-teamspace-projects",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/projects/<uuid:project_id>/",
        WorkspaceTeamspaceProjectsEndpoint.as_view(),
        name="workspace-teamspace-project-detail",
    ),
    # Teamspace overview / dashboard (feature 2)
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/overview/",
        WorkspaceTeamspaceOverviewEndpoint.as_view(),
        name="workspace-teamspace-overview",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/cycles/",
        WorkspaceTeamspaceCyclesEndpoint.as_view(),
        name="workspace-teamspace-cycles",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/relations/",
        WorkspaceTeamspaceRelationsEndpoint.as_view(),
        name="workspace-teamspace-relations",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/stats/",
        WorkspaceTeamspaceStatsEndpoint.as_view(),
        name="workspace-teamspace-stats",
    ),
    # Teamspace Pages (feature 3)
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/pages/",
        WorkspaceTeamspacePagesEndpoint.as_view(),
        name="workspace-teamspace-pages",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/pages/<uuid:page_id>/",
        WorkspaceTeamspacePagesEndpoint.as_view(),
        name="workspace-teamspace-page-detail",
    ),
    # Teamspace Views (feature 3)
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/views/",
        WorkspaceTeamspaceViewsEndpoint.as_view(),
        name="workspace-teamspace-views",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:teamspace_id>/views/<uuid:view_id>/",
        WorkspaceTeamspaceViewsEndpoint.as_view(),
        name="workspace-teamspace-view-detail",
    ),
]
