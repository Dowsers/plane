# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Workspace/project-scoped, session-authenticated endpoints for GitHub
native PR<->issue linking - see
docs/feature-specs/07-integrations-git.md ("1. GitHub natif",
"Considerations API/UX") in plane-selfhost.

PAT-FIRST V1 (see this feature's README "Testing"/"PAT-first scope
decision" section for the full reasoning): `GithubConnectionEndpoint.post`
only accepts `installation_type=personal_access_token` today - the OAuth
App path is scaffolded (`plane.authentication.provider.oauth.github_app`)
but its callback view returns 501, since completing it needs a real,
registered GitHub App this sandbox cannot create.

PERMISSIONS (exigence 9): workspace-level connect/disconnect/repo-listing
is Admin-only (`level="WORKSPACE"`); project-level repo-sync + state
mapping CRUD is Admin/Member of that *project*; manual PR link/unlink is
also Admin/Member (this fork has no finer-grained "can edit this specific
issue" permission than project role - see `allow_permission`'s own
implementation); reading linked PRs is open to every active project
member including Guests (GitHub's spec doesn't explicitly restrict reads,
matching the read-open convention `SLAPolicy`'s own issue-status endpoint
already uses for the analogous case).
"""

import re
import secrets

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    GithubRepositoryProjectSyncSerializer,
    GithubWorkspaceConnectionSerializer,
    IssuePullRequestLinkSerializer,
    ProjectGithubStateMappingSerializer,
)
from plane.db.models import (
    GithubInstallationType,
    GithubPullRequest,
    GithubPullRequestLinkType,
    GithubPullRequestStatus,
    GithubRepository,
    GithubRepositoryProjectSync,
    GithubStateMappingTrigger,
    GithubWorkspaceConnection,
    Issue,
    IssuePullRequestLink,
    Project,
    ProjectGithubStateMapping,
    State,
    Workspace,
)
from plane.db.models.user import BotTypeEnum
from plane.utils import github_client
from plane.utils.exception_logger import log_exception
from plane.utils.github_sync_engine import dispatch_unlink_event, resolve_pull_request_status
from plane.utils.integration_bot import get_or_create_integration_bot

from .base import BaseAPIView

_PR_URL_RE = re.compile(r"github\.com/(?P<full_name>[^/]+/[^/]+)/pull/(?P<number>\d+)")


class GithubOAuthCallbackEndpoint(BaseAPIView):
    """OAuth App scaffolding callback - see
    `plane.authentication.provider.oauth.github_app.GitHubAppOAuthProvider`'s
    module docstring. Always returns 501 in this sandbox (no real GitHub
    App is registered) - the PAT-based `GithubConnectionEndpoint.post`
    above is the fully-working v1 connect path."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        return Response(
            {
                "error": "GitHub OAuth App connection is not enabled on this self-hosted instance. "
                "Register a GitHub App with 'repo' permissions, set GITHUB_APP_CLIENT_ID/"
                "GITHUB_APP_CLIENT_SECRET, and finish wiring GitHubAppOAuthProvider - or use the "
                "fully-supported Personal Access Token connection at "
                "POST /workspaces/<slug>/integrations/github/.",
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )


class GithubConnectionEndpoint(BaseAPIView):
    """`GET`/`POST`/`DELETE` on `/workspaces/<slug>/integrations/github/`."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        connection = GithubWorkspaceConnection.objects.filter(workspace__slug=slug).first()
        if connection is None:
            return Response({"connected": False}, status=status.HTTP_200_OK)
        return Response(
            {"connected": True, **GithubWorkspaceConnectionSerializer(connection).data},
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        installation_type = request.data.get("installation_type", GithubInstallationType.PERSONAL_ACCESS_TOKEN)
        access_token = request.data.get("access_token")

        if installation_type != GithubInstallationType.PERSONAL_ACCESS_TOKEN:
            # OAuth App scaffolding - see module docstring.
            return Response(
                {"error": "Only 'personal_access_token' is supported in this v1 - see the GitHub OAuth App "
                          "scaffolding docs for the disabled-by-default alternate path."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not access_token:
            return Response({"error": "access_token is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            github_user = github_client.get_authenticated_user(access_token)
        except github_client.GithubAPIError as e:
            return Response(
                {"error": f"Could not authenticate with GitHub using the provided token: {e.message}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = GithubWorkspaceConnection.objects.filter(workspace=workspace).first()
        if existing is not None:
            existing.delete()

        connection = GithubWorkspaceConnection.objects.create(
            workspace=workspace,
            installation_type=GithubInstallationType.PERSONAL_ACCESS_TOKEN,
            access_token=access_token,
            github_account_login=github_user.get("login", ""),
            github_account_type=github_user.get("type", "User").lower(),
            connected_by=request.user,
        )
        return Response(GithubWorkspaceConnectionSerializer(connection).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug):
        connection = GithubWorkspaceConnection.objects.filter(workspace__slug=slug).first()
        if connection is None:
            return Response({"error": "Not connected"}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 9: best-effort webhook teardown, non-blocking on failure.
        for repository in GithubRepository.objects.filter(workspace_connection=connection):
            for repository_sync in GithubRepositoryProjectSync.objects.filter(repository=repository):
                _delete_webhook_best_effort(connection.access_token, repository, repository_sync)

        connection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GithubRepositoryListEndpoint(BaseAPIView):
    """`GET /workspaces/<slug>/integrations/github/repositories/` - live
    list from the GitHub API (exigence: "pour le selecteur UI")."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        connection = GithubWorkspaceConnection.objects.filter(workspace__slug=slug).first()
        if connection is None:
            return Response({"error": "GitHub is not connected for this workspace"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            repositories = github_client.list_repositories(connection.access_token)
        except github_client.GithubAPIError as e:
            return Response({"error": e.message}, status=e.status_code or status.HTTP_502_BAD_GATEWAY)

        return Response(repositories, status=status.HTTP_200_OK)


class GithubRepositoryProjectSyncViewSet(BaseAPIView):
    """`GET`/`POST` on `/workspaces/<slug>/projects/<project_id>/github-repository-syncs/`,
    `DELETE` on `.../github-repository-syncs/<pk>/`."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        syncs = GithubRepositoryProjectSync.objects.filter(project_id=project_id, workspace__slug=slug).select_related(
            "repository"
        )
        return Response(GithubRepositoryProjectSyncSerializer(syncs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        connection = GithubWorkspaceConnection.objects.filter(workspace=project.workspace).first()
        if connection is None:
            return Response({"error": "GitHub is not connected for this workspace"}, status=status.HTTP_400_BAD_REQUEST)

        github_repo_id = request.data.get("github_repo_id")
        full_name = request.data.get("full_name")
        if not github_repo_id or not full_name:
            return Response({"error": "github_repo_id and full_name are required"}, status=status.HTTP_400_BAD_REQUEST)

        if not settings.INTEGRATIONS_WEBHOOK_BASE_URL:
            return Response(
                {"error": "INTEGRATIONS_WEBHOOK_BASE_URL is not configured on this instance - a GitHub "
                          "webhook needs a publicly-reachable callback URL, which this self-hosted "
                          "instance has not declared. Set it and retry."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        repository, _ = GithubRepository.objects.get_or_create(
            workspace_connection=connection,
            github_repo_id=github_repo_id,
            defaults={
                "workspace": connection.workspace,
                "full_name": full_name,
                "html_url": request.data.get("html_url", ""),
                "default_branch": request.data.get("default_branch", "main"),
            },
        )

        if GithubRepositoryProjectSync.objects.filter(repository=repository, project=project).exists():
            return Response(
                {"error": "This repository is already synced to this project"}, status=status.HTTP_409_CONFLICT
            )

        webhook_secret = secrets.token_hex(32)
        callback_url = settings.INTEGRATIONS_WEBHOOK_BASE_URL.rstrip("/") + "/api/public/webhooks/github/"

        try:
            hook = github_client.create_webhook(connection.access_token, full_name, callback_url, webhook_secret)
        except github_client.GithubAPIError as e:
            return Response(
                {"error": f"Failed to register GitHub webhook: {e.message}"}, status=status.HTTP_502_BAD_GATEWAY
            )

        repository_sync = GithubRepositoryProjectSync.objects.create(
            repository=repository,
            project=project,
            workspace=project.workspace,
            webhook_external_id=str(hook.get("id", "")),
            webhook_secret=webhook_secret,
        )

        get_or_create_integration_bot(project.workspace, BotTypeEnum.GITHUB_BOT)

        return Response(
            GithubRepositoryProjectSyncSerializer(repository_sync).data, status=status.HTTP_201_CREATED
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, pk):
        repository_sync = GithubRepositoryProjectSync.objects.filter(
            pk=pk, project_id=project_id, workspace__slug=slug
        ).select_related("repository", "repository__workspace_connection").first()
        if repository_sync is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        _delete_webhook_best_effort(
            repository_sync.repository.workspace_connection.access_token,
            repository_sync.repository,
            repository_sync,
        )
        # Historical GithubPullRequest/IssuePullRequestLink rows are
        # intentionally kept (exigence 9's "conserver les liens PR deja
        # crees en lecture seule") - only the sync configuration itself
        # (and, best-effort, the GitHub-side webhook) is removed.
        repository_sync.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectGithubStateMappingEndpoint(BaseAPIView):
    """`GET`/`PUT` on
    `/workspaces/<slug>/projects/<project_id>/github-repository-syncs/<sync_id>/state-mapping/`."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, sync_id):
        repository_sync = GithubRepositoryProjectSync.objects.filter(
            pk=sync_id, project_id=project_id, workspace__slug=slug
        ).first()
        if repository_sync is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        mappings = ProjectGithubStateMapping.objects.filter(repository_sync=repository_sync)
        return Response(ProjectGithubStateMappingSerializer(mappings, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, sync_id):
        repository_sync = GithubRepositoryProjectSync.objects.filter(
            pk=sync_id, project_id=project_id, workspace__slug=slug
        ).first()
        if repository_sync is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        valid_triggers = {choice[0] for choice in GithubStateMappingTrigger.choices}
        entries = request.data.get("mappings", [])
        if not isinstance(entries, list):
            return Response({"error": "'mappings' must be a list"}, status=status.HTTP_400_BAD_REQUEST)

        results = []
        for entry in entries:
            trigger = entry.get("trigger")
            if trigger not in valid_triggers:
                return Response({"error": f"Invalid trigger '{trigger}'"}, status=status.HTTP_400_BAD_REQUEST)

            target_state_id = entry.get("target_state")
            if target_state_id is not None and not State.objects.filter(
                pk=target_state_id, project_id=project_id
            ).exists():
                return Response(
                    {"error": f"Invalid target_state for trigger '{trigger}'"}, status=status.HTTP_400_BAD_REQUEST
                )

            mapping, _ = ProjectGithubStateMapping.objects.update_or_create(
                repository_sync=repository_sync,
                trigger=trigger,
                defaults={"target_state_id": target_state_id},
            )
            results.append(mapping)

        return Response(ProjectGithubStateMappingSerializer(results, many=True).data, status=status.HTTP_200_OK)


class IssuePullRequestLinkViewSet(BaseAPIView):
    """`GET`/`POST`/`DELETE` on
    `/workspaces/<slug>/projects/<project_id>/issues/<issue_id>/github-pull-requests/[<pk>/]` -
    exigence 10's manual link/unlink fallback."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        links = IssuePullRequestLink.objects.filter(
            issue_id=issue_id, project_id=project_id, workspace__slug=slug
        ).select_related("pull_request")
        return Response(IssuePullRequestLinkSerializer(links, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug).first()
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        url = request.data.get("url", "")
        match = _PR_URL_RE.search(url)
        if not match:
            return Response(
                {"error": "url must be a full GitHub PR URL, e.g. https://github.com/owner/repo/pull/123"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        full_name = match.group("full_name")
        number = int(match.group("number"))

        connection = GithubWorkspaceConnection.objects.filter(workspace__slug=slug).first()
        if connection is None:
            return Response({"error": "GitHub is not connected for this workspace"}, status=status.HTTP_400_BAD_REQUEST)

        repository = GithubRepository.objects.filter(
            workspace_connection=connection, full_name__iexact=full_name
        ).first()
        if repository is None:
            # A manual link is allowed even for a repo that was never
            # explicitly added via the repository-sync flow - resolve it
            # fresh from the real GitHub API and register it locally
            # (read-only metadata, no webhook - see this feature's README).
            try:
                repo_data = github_client.get_repository(connection.access_token, full_name)
            except github_client.GithubAPIError as e:
                return Response(
                    {"error": f"Could not resolve repository: {e.message}"}, status=status.HTTP_400_BAD_REQUEST
                )
            repository = GithubRepository.objects.create(
                workspace_connection=connection,
                workspace=connection.workspace,
                github_repo_id=repo_data["id"],
                full_name=repo_data["full_name"],
                html_url=repo_data.get("html_url", ""),
                default_branch=repo_data.get("default_branch", "main"),
            )

        try:
            pr_data = github_client.get_pull_request(connection.access_token, full_name, number)
        except github_client.GithubAPIError as e:
            return Response(
                {"error": f"Could not resolve pull request: {e.message}"}, status=status.HTTP_400_BAD_REQUEST
            )

        status_value = (
            resolve_pull_request_status("closed" if pr_data.get("state") == "closed" else "opened",
                                         pr_data.get("draft", False), pr_data.get("merged", False))
            or GithubPullRequestStatus.OPEN
        )

        pull_request, _ = GithubPullRequest.objects.update_or_create(
            repository=repository,
            number=number,
            defaults={
                "workspace": repository.workspace,
                "github_pr_id": pr_data["id"],
                "title": pr_data.get("title", ""),
                "url": pr_data.get("html_url", ""),
                "status": status_value,
                "author_login": (pr_data.get("user") or {}).get("login", ""),
                "source_branch": (pr_data.get("head") or {}).get("ref", ""),
                "target_branch": (pr_data.get("base") or {}).get("ref", ""),
            },
        )

        if IssuePullRequestLink.objects.filter(issue=issue, pull_request=pull_request).exists():
            return Response({"error": "This PR is already linked to this issue"}, status=status.HTTP_409_CONFLICT)

        link = IssuePullRequestLink.objects.create(
            issue=issue,
            pull_request=pull_request,
            link_type=GithubPullRequestLinkType.MANUAL,
            workspace=issue.workspace,
            project=issue.project,
            created_by=request.user,
        )
        return Response(IssuePullRequestLinkSerializer(link).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        link = IssuePullRequestLink.objects.filter(
            pk=pk, issue_id=issue_id, project_id=project_id, workspace__slug=slug
        ).select_related("pull_request", "issue").first()
        if link is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        dispatch_unlink_event(link, request.user, issue=link.issue)
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _delete_webhook_best_effort(access_token, repository, repository_sync):
    if not repository_sync.webhook_external_id:
        return
    try:
        github_client.delete_webhook(access_token, repository.full_name, repository_sync.webhook_external_id)
    except Exception as e:
        # Exigence 9 - "best-effort, avec message d'erreur non bloquant".
        log_exception(e, warning=True)
