# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializers for GitHub native PR<->issue linking - see
docs/feature-specs/07-integrations-git.md ("1. GitHub natif") in
plane-selfhost. `access_token`/`refresh_token`/`webhook_secret` are never
included in any of these - they exist only so the connect/create-sync
views can decrypt+use them server-side (via `EncryptedTextField`), never
so a client can read them back.
"""

from plane.db.models import (
    GithubPullRequest,
    GithubRepository,
    GithubRepositoryProjectSync,
    GithubWorkspaceConnection,
    IssuePullRequestLink,
    ProjectGithubStateMapping,
)

from .base import BaseSerializer


class GithubWorkspaceConnectionSerializer(BaseSerializer):
    class Meta:
        model = GithubWorkspaceConnection
        fields = [
            "id",
            "workspace",
            "installation_type",
            "github_account_login",
            "github_account_type",
            "connected_by",
            "created_at",
        ]
        read_only_fields = fields


class GithubRepositorySerializer(BaseSerializer):
    class Meta:
        model = GithubRepository
        fields = ["id", "workspace_connection", "github_repo_id", "full_name", "html_url", "default_branch"]
        read_only_fields = ["id", "workspace_connection"]


class GithubRepositoryProjectSyncSerializer(BaseSerializer):
    repository_detail = GithubRepositorySerializer(source="repository", read_only=True)

    class Meta:
        model = GithubRepositoryProjectSync
        fields = [
            "id",
            "project",
            "repository",
            "repository_detail",
            "is_active",
            "allow_backward_transition",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["id", "project", "repository", "repository_detail", "created_by", "created_at"]


class ProjectGithubStateMappingSerializer(BaseSerializer):
    class Meta:
        model = ProjectGithubStateMapping
        fields = ["id", "repository_sync", "trigger", "target_state"]
        read_only_fields = ["id", "repository_sync"]


class GithubPullRequestSerializer(BaseSerializer):
    class Meta:
        model = GithubPullRequest
        fields = [
            "id",
            "repository",
            "number",
            "title",
            "url",
            "status",
            "author_login",
            "source_branch",
            "target_branch",
            "merged_at",
            "closed_at",
        ]
        read_only_fields = fields


class IssuePullRequestLinkSerializer(BaseSerializer):
    pull_request_detail = GithubPullRequestSerializer(source="pull_request", read_only=True)

    class Meta:
        model = IssuePullRequestLink
        fields = ["id", "issue", "pull_request", "pull_request_detail", "link_type", "created_by", "created_at"]
        read_only_fields = ["id", "issue", "pull_request_detail", "link_type", "created_by", "created_at"]
