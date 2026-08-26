from django.urls import path

from plane.api.views.team import (
    TeamViewSet,
    TeamMemberViewSet,
    TeamProjectViewSet,
)

urlpatterns = [
    # Team CRUD
    path(
        "workspaces/<str:slug>/teams/",
        TeamViewSet.as_view(http_method_names=["get", "post"]),
        name="teams",
    ),
    path(
        "workspaces/<str:slug>/teams/<uuid:pk>/",
        TeamViewSet.as_view(http_method_names=["get", "patch", "delete"]),
        name="teams",
    ),
    # Team Members
    path(
        "workspaces/<str:slug>/teams/<uuid:team_id>/members/",
        TeamMemberViewSet.as_view(http_method_names=["get", "post"]),
        name="team-members",
    ),
    path(
        "workspaces/<str:slug>/teams/<uuid:team_id>/members/<uuid:pk>/",
        TeamMemberViewSet.as_view(http_method_names=["delete"]),
        name="team-members",
    ),
    # Team Projects
    path(
        "workspaces/<str:slug>/teams/<uuid:team_id>/projects/",
        TeamProjectViewSet.as_view(http_method_names=["get", "post"]),
        name="team-projects",
    ),
    path(
        "workspaces/<str:slug>/teams/<uuid:team_id>/projects/<uuid:pk>/",
        TeamProjectViewSet.as_view(http_method_names=["delete"]),
        name="team-projects",
    ),
]
