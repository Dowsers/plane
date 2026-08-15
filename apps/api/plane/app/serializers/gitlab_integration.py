# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializers for GitLab native MR<->issue linking - see
docs/feature-specs/07-integrations-git.md ("2. GitLab natif") in
plane-selfhost. `access_token`/`webhook_secret_token` are never included -
same reasoning as github_integration.py's own serializers.
"""

from plane.db.models import (
    GitlabMergeRequestIssueSync,
    GitlabRepository,
    GitlabRepositoryProjectConnection,
    GitlabWorkspaceConnection,
    ProjectGitlabSyncSettings,
)

from .base import BaseSerializer


class GitlabWorkspaceConnectionSerializer(BaseSerializer):
    class Meta:
        model = GitlabWorkspaceConnection
        fields = ["id", "workspace", "instance_url", "token_type", "gitlab_username", "connected_by", "created_at"]
        read_only_fields = fields


class GitlabRepositorySerializer(BaseSerializer):
    class Meta:
        model = GitlabRepository
        fields = [
            "id",
            "workspace_connection",
            "instance_url",
            "gitlab_project_id",
            "path_with_namespace",
            "token_type",
            "webhook_id",
        ]
        read_only_fields = ["id", "workspace_connection", "webhook_id"]


class GitlabRepositoryProjectConnectionSerializer(BaseSerializer):
    repository_detail = GitlabRepositorySerializer(source="repository", read_only=True)

    class Meta:
        model = GitlabRepositoryProjectConnection
        fields = ["id", "project", "repository", "repository_detail", "created_by", "created_at"]
        read_only_fields = ["id", "project", "repository", "repository_detail", "created_by", "created_at"]


class ProjectGitlabSyncSettingsSerializer(BaseSerializer):
    class Meta:
        model = ProjectGitlabSyncSettings
        fields = [
            "id",
            "project",
            "sync_title_description",
            "sync_assignee",
            "sync_labels",
            "create_missing_labels",
            "link_pattern",
            "allow_backward_transition",
            "state_on_open",
            "state_on_ready",
            "state_on_merge",
            "state_on_close",
        ]
        read_only_fields = ["id", "project"]


class GitlabMergeRequestIssueSyncSerializer(BaseSerializer):
    class Meta:
        model = GitlabMergeRequestIssueSync
        fields = [
            "id",
            "issue",
            "repository",
            "merge_request_id",
            "merge_request_iid",
            "title",
            "source_branch",
            "target_branch",
            "state",
            "draft",
            "web_url",
            "last_synced_at",
        ]
        read_only_fields = fields
