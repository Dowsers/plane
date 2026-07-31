# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    InitiativeViewSet,
    InitiativeProjectViewSet,
    InitiativeActivityEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/initiatives/",
        InitiativeViewSet.as_view({"get": "list", "post": "create"}),
        name="initiative",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/",
        InitiativeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="initiative",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/projects/",
        InitiativeProjectViewSet.as_view(),
        name="initiative-project",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/projects/<uuid:project_id>/",
        InitiativeProjectViewSet.as_view(),
        name="initiative-project",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/activities/",
        InitiativeActivityEndpoint.as_view(),
        name="initiative-activity",
    ),
]
