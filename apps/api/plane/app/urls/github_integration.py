# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    GithubConnectionEndpoint,
    GithubOAuthCallbackEndpoint,
    GithubRepositoryListEndpoint,
    GithubRepositoryProjectSyncViewSet,
    IssuePullRequestLinkViewSet,
    ProjectGithubStateMappingEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/integrations/github/",
        GithubConnectionEndpoint.as_view(),
        name="github-connection",
    ),
    path(
        "workspaces/<str:slug>/integrations/github/oauth/callback/",
        GithubOAuthCallbackEndpoint.as_view(),
        name="github-oauth-callback",
    ),
    path(
        "workspaces/<str:slug>/integrations/github/repositories/",
        GithubRepositoryListEndpoint.as_view(),
        name="github-repository-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-repository-syncs/",
        GithubRepositoryProjectSyncViewSet.as_view(),
        name="github-repository-project-sync",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-repository-syncs/<uuid:pk>/",
        GithubRepositoryProjectSyncViewSet.as_view(),
        name="github-repository-project-sync-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-repository-syncs/<uuid:sync_id>/state-mapping/",
        ProjectGithubStateMappingEndpoint.as_view(),
        name="github-state-mapping",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/github-pull-requests/",
        IssuePullRequestLinkViewSet.as_view(),
        name="issue-github-pull-requests",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/github-pull-requests/<uuid:pk>/",
        IssuePullRequestLinkViewSet.as_view(),
        name="issue-github-pull-requests-detail",
    ),
]
