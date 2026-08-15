# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    GitlabConnectionEndpoint,
    GitlabMergeRequestIssueSyncViewSet,
    GitlabRepositoryListEndpoint,
    GitlabRepositoryProjectConnectionViewSet,
    ProjectGitlabSyncSettingsEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/integrations/gitlab/connect/",
        GitlabConnectionEndpoint.as_view(),
        name="gitlab-connection",
    ),
    path(
        "workspaces/<str:slug>/integrations/gitlab/repositories/",
        GitlabRepositoryListEndpoint.as_view(),
        name="gitlab-repository-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/gitlab-repositories/",
        GitlabRepositoryProjectConnectionViewSet.as_view(),
        name="gitlab-repository-project-connection",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/gitlab-repositories/<uuid:pk>/",
        GitlabRepositoryProjectConnectionViewSet.as_view(),
        name="gitlab-repository-project-connection-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/gitlab-sync-settings/",
        ProjectGitlabSyncSettingsEndpoint.as_view(),
        name="gitlab-sync-settings",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/gitlab-merge-requests/",
        GitlabMergeRequestIssueSyncViewSet.as_view(),
        name="issue-gitlab-merge-requests",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/gitlab-merge-requests/<uuid:pk>/",
        GitlabMergeRequestIssueSyncViewSet.as_view(),
        name="issue-gitlab-merge-requests-detail",
    ),
]
