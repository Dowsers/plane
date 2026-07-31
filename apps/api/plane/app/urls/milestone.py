# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    MilestoneViewSet,
    MilestoneReorderEndpoint,
    MilestoneIssueViewSet,
    MilestoneAvailableIssuesEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/",
        MilestoneViewSet.as_view({"get": "list", "post": "create"}),
        name="milestone",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:pk>/",
        MilestoneViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="milestone",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/reorder/",
        MilestoneReorderEndpoint.as_view(),
        name="milestone-reorder",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/available-issues/",
        MilestoneAvailableIssuesEndpoint.as_view(),
        name="milestone-available-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:milestone_id>/issues/",
        MilestoneIssueViewSet.as_view(),
        name="milestone-issue",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:milestone_id>/issues/<uuid:issue_id>/",
        MilestoneIssueViewSet.as_view(),
        name="milestone-issue",
    ),
]
