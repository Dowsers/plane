from django.urls import path

from plane.app.views.workspace.team import (
    WorkspaceTeamsEndpoint,
    WorkspaceTeamMembersEndpoint,
    WorkspaceTeamProjectsEndpoint,
)

urlpatterns = [
    # Team CRUD
    path(
        "workspaces/<str:slug>/teams/",
        WorkspaceTeamsEndpoint.as_view({"get": "list", "post": "create"}),
        name="workspace-teams",
    ),
    path(
        "workspaces/<str:slug>/teams/<uuid:pk>/",
        WorkspaceTeamsEndpoint.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-team-detail",
    ),
    # Team Members
    path(
        "workspaces/<str:slug>/teams/<uuid:team_id>/members/",
        WorkspaceTeamMembersEndpoint.as_view(),
        name="workspace-team-members",
    ),
    path(
        "workspaces/<str:slug>/teams/<uuid:team_id>/members/<uuid:member_id>/",
        WorkspaceTeamMembersEndpoint.as_view(),
        name="workspace-team-member-detail",
    ),
    # Team Projects
    path(
        "workspaces/<str:slug>/teams/<uuid:team_id>/projects/",
        WorkspaceTeamProjectsEndpoint.as_view(),
        name="workspace-team-projects",
    ),
    path(
        "workspaces/<str:slug>/teams/<uuid:team_id>/projects/<uuid:project_id>/",
        WorkspaceTeamProjectsEndpoint.as_view(),
        name="workspace-team-project-detail",
    ),
]
