# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Workspace/project-scoped, session-authenticated endpoints for GitLab
native MR<->issue linking - see
docs/feature-specs/07-integrations-git.md ("2. GitLab natif",
"Considerations API/UX") in plane-selfhost. Same PAT-first v1 scope
decision, and the same permission shape, as
plane.app.views.github_integration - see that module's docstring for the
full reasoning (not repeated here).
"""

import re
import secrets

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    GitlabMergeRequestIssueSyncSerializer,
    GitlabRepositoryProjectConnectionSerializer,
    GitlabWorkspaceConnectionSerializer,
    ProjectGitlabSyncSettingsSerializer,
)
from plane.db.models import (
    GitlabMergeRequestIssueSync,
    GitlabRepository,
    GitlabRepositoryProjectConnection,
    GitlabTokenType,
    GitlabWorkspaceConnection,
    Issue,
    Project,
    ProjectGitlabSyncSettings,
    Workspace,
)
from plane.db.models.gitlab_integration import DEFAULT_GITLAB_INSTANCE_URL
from plane.db.models.user import BotTypeEnum
from plane.utils import gitlab_client
from plane.utils.exception_logger import log_exception
from plane.utils.gitlab_sync_engine import dispatch_unlink_event
from plane.utils.integration_bot import get_or_create_integration_bot

from .base import BaseAPIView

_MR_URL_RE = re.compile(r"^(?P<base>https?://[^/]+)/(?P<path>.+)/-/merge_requests/(?P<iid>\d+)/?$")


class GitlabConnectionEndpoint(BaseAPIView):
    """`GET`/`POST`/`DELETE` on `/workspaces/<slug>/integrations/gitlab/connect/`."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        connection = GitlabWorkspaceConnection.objects.filter(workspace__slug=slug).first()
        if connection is None:
            return Response({"connected": False}, status=status.HTTP_200_OK)
        return Response(
            {"connected": True, **GitlabWorkspaceConnectionSerializer(connection).data},
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        instance_url = request.data.get("instance_url") or DEFAULT_GITLAB_INSTANCE_URL
        access_token = request.data.get("access_token")
        if not access_token:
            return Response({"error": "access_token is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            gitlab_user = gitlab_client.get_authenticated_user(instance_url, access_token)
        except gitlab_client.GitlabAPIError as e:
            return Response(
                {"error": f"Could not authenticate with GitLab using the provided token: {e.message}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        username = gitlab_user.get("username", "")

        existing = GitlabWorkspaceConnection.objects.filter(workspace=workspace).first()
        if existing is not None:
            existing.delete()

        connection = GitlabWorkspaceConnection.objects.create(
            workspace=workspace,
            instance_url=instance_url,
            access_token=access_token,
            token_type=GitlabTokenType.PAT,
            gitlab_username=username,
            connected_by=request.user,
        )
        return Response(GitlabWorkspaceConnectionSerializer(connection).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug):
        connection = GitlabWorkspaceConnection.objects.filter(workspace__slug=slug).first()
        if connection is None:
            return Response({"error": "Not connected"}, status=status.HTTP_404_NOT_FOUND)

        for repository in GitlabRepository.objects.filter(workspace_connection=connection):
            _delete_webhook_best_effort(repository)

        connection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GitlabRepositoryListEndpoint(BaseAPIView):
    """`GET /workspaces/<slug>/integrations/gitlab/repositories/`."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        connection = GitlabWorkspaceConnection.objects.filter(workspace__slug=slug).first()
        if connection is None:
            return Response({"error": "GitLab is not connected for this workspace"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            projects = gitlab_client.list_projects(connection.instance_url, connection.access_token)
        except gitlab_client.GitlabAPIError as e:
            return Response({"error": e.message}, status=e.status_code or status.HTTP_502_BAD_GATEWAY)

        return Response(projects, status=status.HTTP_200_OK)


class GitlabRepositoryProjectConnectionViewSet(BaseAPIView):
    """`GET`/`POST` on `/workspaces/<slug>/projects/<project_id>/gitlab-repositories/`,
    `DELETE` on `.../gitlab-repositories/<pk>/`."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        connections = GitlabRepositoryProjectConnection.objects.filter(
            project_id=project_id, workspace__slug=slug
        ).select_related("repository")
        return Response(
            GitlabRepositoryProjectConnectionSerializer(connections, many=True).data, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        connection = GitlabWorkspaceConnection.objects.filter(workspace=project.workspace).first()
        if connection is None:
            return Response({"error": "GitLab is not connected for this workspace"}, status=status.HTTP_400_BAD_REQUEST)

        gitlab_project_id = request.data.get("gitlab_project_id")
        path_with_namespace = request.data.get("path_with_namespace")
        if not gitlab_project_id or not path_with_namespace:
            return Response(
                {"error": "gitlab_project_id and path_with_namespace are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not settings.INTEGRATIONS_WEBHOOK_BASE_URL:
            return Response(
                {"error": "INTEGRATIONS_WEBHOOK_BASE_URL is not configured on this instance - a GitLab "
                          "webhook needs a publicly-reachable callback URL, which this self-hosted "
                          "instance has not declared. Set it and retry."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_repo = GitlabRepository.objects.filter(
            instance_url=connection.instance_url, gitlab_project_id=gitlab_project_id
        ).first()
        if existing_repo is not None and hasattr(existing_repo, "project_connection"):
            return Response(
                {"error": "This GitLab repository is already connected to a Plane project "
                          "(a repository can only feed one Plane project)"},
                status=status.HTTP_409_CONFLICT,
            )

        webhook_secret_token = secrets.token_hex(32)
        callback_url = None  # set after repository row exists, needs its id

        repository = existing_repo or GitlabRepository.objects.create(
            workspace_connection=connection,
            workspace=connection.workspace,
            instance_url=connection.instance_url,
            gitlab_project_id=gitlab_project_id,
            path_with_namespace=path_with_namespace,
            access_token=connection.access_token,
            token_type=connection.token_type,
            webhook_secret_token=webhook_secret_token,
        )

        callback_url = (
            settings.INTEGRATIONS_WEBHOOK_BASE_URL.rstrip("/")
            + f"/api/public/integrations/gitlab/webhook/{repository.id}/"
        )

        try:
            hook = gitlab_client.create_webhook(
                repository.instance_url, repository.access_token, repository.gitlab_project_id,
                callback_url, repository.webhook_secret_token,
            )
        except gitlab_client.GitlabAPIError as e:
            return Response(
                {"error": f"Failed to register GitLab webhook: {e.message}"}, status=status.HTTP_502_BAD_GATEWAY
            )

        repository.webhook_id = hook.get("id")
        repository.save(update_fields=["webhook_id"])

        connection_row = GitlabRepositoryProjectConnection.objects.create(
            project=project, repository=repository, workspace=project.workspace,
        )
        ProjectGitlabSyncSettings.objects.get_or_create(
            project=project, defaults={"workspace": project.workspace}
        )

        get_or_create_integration_bot(project.workspace, BotTypeEnum.GITLAB_BOT)

        return Response(
            GitlabRepositoryProjectConnectionSerializer(connection_row).data, status=status.HTTP_201_CREATED
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, pk):
        connection_row = GitlabRepositoryProjectConnection.objects.filter(
            pk=pk, project_id=project_id, workspace__slug=slug
        ).select_related("repository").first()
        if connection_row is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        _delete_webhook_best_effort(connection_row.repository)
        connection_row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectGitlabSyncSettingsEndpoint(BaseAPIView):
    """`GET`/`PATCH` on `/workspaces/<slug>/projects/<project_id>/gitlab-sync-settings/`."""

    _PATCHABLE_FIELDS = [
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

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        settings_row, _ = ProjectGitlabSyncSettings.objects.get_or_create(
            project=project, defaults={"workspace": project.workspace}
        )
        return Response(ProjectGitlabSyncSettingsSerializer(settings_row).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        settings_row, _ = ProjectGitlabSyncSettings.objects.get_or_create(
            project=project, defaults={"workspace": project.workspace}
        )

        update_fields = []
        for field in self._PATCHABLE_FIELDS:
            if field in request.data:
                setattr(settings_row, field, request.data[field])
                update_fields.append(field)
        if update_fields:
            settings_row.save(update_fields=update_fields)

        return Response(ProjectGitlabSyncSettingsSerializer(settings_row).data, status=status.HTTP_200_OK)


class GitlabMergeRequestIssueSyncViewSet(BaseAPIView):
    """`GET`/`POST` on
    `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/gitlab-merge-requests/`,
    `DELETE` on `.../gitlab-merge-requests/<pk>/` - exigence 6's manual
    link/unlink fallback. Guests get read-only access (exigence 15)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        syncs = GitlabMergeRequestIssueSync.objects.filter(
            issue_id=issue_id, project_id=project_id, workspace__slug=slug
        )
        return Response(GitlabMergeRequestIssueSyncSerializer(syncs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug).first()
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        url = request.data.get("url", "")
        match = _MR_URL_RE.match(url.strip())
        if not match:
            return Response(
                {"error": "url must be a full GitLab MR URL, e.g. "
                          "https://gitlab.com/group/project/-/merge_requests/42"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        base = match.group("base")
        path_with_namespace = match.group("path")
        merge_iid = int(match.group("iid"))

        repository = GitlabRepository.objects.filter(
            instance_url__iexact=base, path_with_namespace__iexact=path_with_namespace
        ).first()
        if repository is None or repository.workspace_id != issue.project.workspace_id:
            return Response(
                {"error": "This GitLab repository is not connected to this workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            mr_data = gitlab_client.get_merge_request(
                repository.instance_url, repository.access_token, repository.gitlab_project_id, merge_iid
            )
        except gitlab_client.GitlabAPIError as e:
            return Response(
                {"error": f"Could not resolve merge request: {e.message}"}, status=status.HTTP_400_BAD_REQUEST
            )

        if GitlabMergeRequestIssueSync.objects.filter(
            repository=repository, merge_request_id=mr_data["id"], issue=issue
        ).exists():
            return Response({"error": "This MR is already linked to this issue"}, status=status.HTTP_409_CONFLICT)

        sync_row = GitlabMergeRequestIssueSync.objects.create(
            issue=issue,
            repository=repository,
            project=issue.project,
            workspace=issue.project.workspace,
            merge_request_id=mr_data["id"],
            merge_request_iid=mr_data["iid"],
            title=mr_data.get("title", ""),
            source_branch=mr_data.get("source_branch", ""),
            target_branch=mr_data.get("target_branch", ""),
            state=mr_data.get("state", "opened"),
            draft=bool(mr_data.get("draft") or mr_data.get("work_in_progress")),
            web_url=mr_data.get("web_url", ""),
            last_synced_at=None,
            created_by=request.user,
        )
        return Response(GitlabMergeRequestIssueSyncSerializer(sync_row).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        sync_row = GitlabMergeRequestIssueSync.objects.filter(
            pk=pk, issue_id=issue_id, project_id=project_id, workspace__slug=slug
        ).select_related("issue").first()
        if sync_row is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        dispatch_unlink_event(sync_row, request.user, issue=sync_row.issue)
        sync_row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _delete_webhook_best_effort(repository):
    if not repository.webhook_id:
        return
    try:
        gitlab_client.delete_webhook(
            repository.instance_url, repository.access_token, repository.gitlab_project_id, repository.webhook_id
        )
    except Exception as e:
        log_exception(e, warning=True)
