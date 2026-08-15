# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Async processing of GitHub `pull_request`/`pull_request_review` webhook
events - see docs/feature-specs/07-integrations-git.md ("1. GitHub
natif") in plane-selfhost. Dispatched from
`plane.space.views.github_gitlab_webhooks.GithubWebhookEndpoint` *after*
signature verification has already passed, so this task never has to
re-validate the request - it trusts `repository_sync_id` as already
resolved and authenticated.

Every step here is wrapped so a failure at any point (a malformed
payload, a since-deleted repository sync, a GitHub API error while
fetching commit messages) is logged and swallowed rather than raised -
this is a webhook processing pipeline with no caller waiting on a
response (the HTTP receiver already returned 200 before this task even
starts), so raising here would only produce a Celery retry-storm against
an event that will never become processable, not a useful error surfaced
to anyone.
"""

from celery import shared_task
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from plane.db.models.user import BotTypeEnum
from plane.utils import github_client
from plane.utils import github_sync_engine as engine
from plane.utils.exception_logger import log_exception
from plane.utils.github_link_detection import detect_references_from_sources
from plane.utils.integration_bot import get_or_create_integration_bot


@shared_task
def process_github_webhook_event(repository_sync_id, event_type, payload):
    from plane.db.models import GithubRepositoryProjectSync

    try:
        repository_sync = (
            GithubRepositoryProjectSync.objects.select_related(
                "repository",
                "repository__workspace_connection",
                "repository__workspace_connection__workspace",
                "project",
            )
            .filter(id=repository_sync_id, is_active=True)
            .first()
        )
        if repository_sync is None:
            return

        actor = get_or_create_integration_bot(
            repository_sync.repository.workspace_connection.workspace, BotTypeEnum.GITHUB_BOT
        )

        if event_type == "pull_request":
            _process_pull_request_event(repository_sync, payload, actor)
        elif event_type == "pull_request_review":
            _process_pull_request_review_event(repository_sync, payload, actor)
    except Exception as e:
        log_exception(e)


def _parse_gh_datetime(value):
    if not value:
        return None
    try:
        return parse_datetime(value)
    except (TypeError, ValueError):
        return None


def _process_pull_request_event(repository_sync, payload, actor):
    from plane.db.models import GithubPullRequest, GithubPullRequestStatus

    action = payload.get("action")
    pr_data = payload.get("pull_request") or {}
    number = pr_data.get("number") or payload.get("number")
    if number is None:
        return

    repository = repository_sync.repository

    pr, _ = GithubPullRequest.objects.get_or_create(
        repository=repository,
        number=number,
        defaults={
            "workspace": repository.workspace_connection.workspace,
            "github_pr_id": pr_data.get("id") or 0,
            "status": GithubPullRequestStatus.OPEN,
        },
    )

    pr.github_pr_id = pr_data.get("id") or pr.github_pr_id
    pr.title = pr_data.get("title") or pr.title
    pr.url = pr_data.get("html_url") or pr.url
    pr.author_login = (pr_data.get("user") or {}).get("login") or pr.author_login
    pr.source_branch = (pr_data.get("head") or {}).get("ref") or pr.source_branch
    pr.target_branch = (pr_data.get("base") or {}).get("ref") or pr.target_branch

    new_status = engine.resolve_pull_request_status(action, pr_data.get("draft", False), pr_data.get("merged", False))
    if new_status is not None:
        pr.status = new_status
        if new_status == GithubPullRequestStatus.MERGED:
            pr.merged_at = _parse_gh_datetime(pr_data.get("merged_at")) or timezone.now()
        if new_status == GithubPullRequestStatus.CLOSED:
            pr.closed_at = _parse_gh_datetime(pr_data.get("closed_at")) or timezone.now()
    pr.save()

    if action in ("opened", "reopened", "edited"):
        commit_messages = []
        token = repository.workspace_connection.access_token
        if token:
            try:
                commit_messages = github_client.list_pull_request_commit_messages(token, repository.full_name, number)
            except Exception as e:
                # Exigence 1's "commits d'une PR" is best-effort - a
                # GitHub API hiccup fetching commits must never block
                # detecting references already present in title/body.
                log_exception(e, warning=True)

        refs = detect_references_from_sources(pr_data.get("title"), pr_data.get("body"), commit_messages)

        if action == "edited":
            engine.reconcile_links_on_edit(pr, refs)

        created_links = engine.sync_links_for_pull_request(pr, refs, actor)
        engine.dispatch_link_events(created_links, actor)

    if new_status is not None:
        touched_issues = {
            link.issue
            for link in pr.issue_links.filter(link_type="closes", deleted_at__isnull=True).select_related("issue")
        }
        for issue in touched_issues:
            if issue.project_id == repository_sync.project_id:
                engine.apply_state_for_issue(issue, repository_sync, actor, triggering_pull_request=pr)


def _process_pull_request_review_event(repository_sync, payload, actor):
    from plane.db.models import GithubPullRequest, GithubPullRequestStatus

    if payload.get("action") != "submitted":
        return

    review = payload.get("review") or {}
    if (review.get("state") or "").lower() != "approved":
        return

    pr_data = payload.get("pull_request") or {}
    number = pr_data.get("number")
    if number is None:
        return

    pr = GithubPullRequest.objects.filter(repository=repository_sync.repository, number=number).first()
    if pr is None:
        # A review on a PR we've never seen an `opened`/`reopened` event
        # for (e.g. registered mid-review-cycle) - nothing to update yet.
        return

    if pr.status in (GithubPullRequestStatus.MERGED, GithubPullRequestStatus.CLOSED):
        # Don't let a stale/out-of-order review event regress an already
        # terminal PR status.
        return

    pr.status = GithubPullRequestStatus.APPROVED
    pr.save(update_fields=["status", "updated_at"])

    for link in pr.issue_links.filter(link_type="closes", deleted_at__isnull=True).select_related("issue"):
        if link.issue.project_id == repository_sync.project_id:
            engine.apply_state_for_issue(link.issue, repository_sync, actor, triggering_pull_request=pr)
