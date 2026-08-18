# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    ProjectUpdateViewSet,
    ProjectUpdateLatestEndpoint,
    ProjectUpdateGenerateSummaryEndpoint,
    ProjectUpdateAIDraftEndpoint,
    ProjectUpdateAIGenerationLogEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/",
        ProjectUpdateViewSet.as_view({"get": "list", "post": "create"}),
        name="project-update",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/latest/",
        ProjectUpdateLatestEndpoint.as_view(),
        name="project-update-latest",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/generate-summary/",
        ProjectUpdateGenerateSummaryEndpoint.as_view(),
        name="project-update-generate-summary",
    ),
    # Category 9 feature 6 - AI-assisted status update drafting (Project
    # only, see plane.utils.project_update_ai_draft module docstring).
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/draft/",
        ProjectUpdateAIDraftEndpoint.as_view(),
        name="project-update-ai-draft",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/ai-update-logs/",
        ProjectUpdateAIGenerationLogEndpoint.as_view(),
        name="project-update-ai-generation-log",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/<uuid:pk>/",
        ProjectUpdateViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-update",
    ),
]
