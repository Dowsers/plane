# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Async processing of GitLab `merge_request` webhook events - see
docs/feature-specs/07-integrations-git.md ("2. GitLab natif", exigence 14:
"le traitement d'un webhook est asynchrone (tache Celery) afin de
repondre a GitLab en moins de 5 secondes") in plane-selfhost. Dispatched
from `plane.space.views.github_gitlab_webhooks.GitlabWebhookEndpoint`
*after* the `X-Gitlab-Token` check has already passed.

Same "log and swallow, never raise" posture as
`plane.bgtasks.github_sync_task` - see that module's docstring for why.
"""

from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

from plane.db.models.user import BotTypeEnum
from plane.utils import gitlab_client
from plane.utils import gitlab_sync_engine as engine
from plane.utils.exception_logger import log_exception
from plane.utils.gitlab_link_detection import detect_references_from_sources
from plane.utils.integration_bot import get_or_create_integration_bot


@shared_task
def process_gitlab_webhook_event(repository_id, payload):
    from plane.db.models import GitlabMergeRequestIssueSync, GitlabRepository

    try:
        if payload.get("object_kind") != "merge_request":
            return

        repository = (
            GitlabRepository.objects.select_related(
                "workspace_connection",
                "workspace_connection__workspace",
                "project_connection",
                "project_connection__project",
            )
            .filter(id=repository_id)
            .first()
        )
        if repository is None:
            return

        connection = getattr(repository, "project_connection", None)
        if connection is None:
            # Repository was added to the workspace but never associated
            # to a Plane project yet - nothing to sync against.
            return
        project = connection.project

        actor = get_or_create_integration_bot(repository.workspace_connection.workspace, BotTypeEnum.GITLAB_BOT)

        object_attrs = payload.get("object_attributes") or {}
        action = object_attrs.get("action")

        assignees = payload.get("assignees") or []
        primary_assignee = assignees[0] if assignees else object_attrs.get("assignee")

        mr_data = {
            "id": object_attrs.get("id"),
            "iid": object_attrs.get("iid"),
            "title": object_attrs.get("title"),
            "description": object_attrs.get("description"),
            "source_branch": object_attrs.get("source_branch"),
            "target_branch": object_attrs.get("target_branch"),
            "state": object_attrs.get("state", "opened"),
            "draft": object_attrs.get("draft"),
            "work_in_progress": object_attrs.get("work_in_progress"),
            "web_url": object_attrs.get("url"),
            "assignee": primary_assignee,
            "labels": payload.get("labels") or [],
        }
        if mr_data["id"] is None:
            return

        try:
            settings_row = project.gitlab_sync_settings
        except ObjectDoesNotExist:
            settings_row = None

        link_pattern = settings_row.link_pattern if settings_row else None

        commit_messages = []
        if action in ("open", "reopen", "update") and repository.access_token:
            try:
                commit_messages = gitlab_client.list_merge_request_commit_messages(
                    repository.instance_url, repository.access_token, repository.gitlab_project_id, mr_data["iid"]
                )
            except Exception as e:
                log_exception(e, warning=True)

        refs = detect_references_from_sources(
            mr_data["title"], mr_data["description"], commit_messages, pattern=link_pattern
        )

        touched_syncs = []
        touched_issue_ids = set()

        for ref in refs:
            issue = engine.resolve_referenced_issue(repository, ref["identifier"], ref["sequence_id"])
            if issue is None:
                continue

            existing = GitlabMergeRequestIssueSync.objects.filter(
                repository=repository, merge_request_id=mr_data["id"], issue=issue
            ).first()
            previous_last_synced_at = existing.last_synced_at if existing else None
            is_new_link = existing is None

            sync_row, _ = engine.upsert_merge_request_sync(repository, issue, mr_data)
            touched_syncs.append(sync_row)
            touched_issue_ids.add(issue.id)

            if is_new_link:
                engine.dispatch_link_event(issue, sync_row, actor)
            if settings_row is not None:
                changes = engine.sync_issue_metadata(issue, mr_data, settings_row, previous_last_synced_at, actor)
                engine.dispatch_metadata_sync_activity(issue, changes, sync_row, actor)

        # Issues already linked to this exact MR from a previous event
        # keep being kept in sync even if this specific revision's
        # title/description no longer matches the regex - GitLab's spec
        # has no "edited reconciliation removes links" rule like GitHub's
        # exigence 12, so an established link is never dropped by a later
        # edit, only ever added to (or removed manually).
        for existing_sync in GitlabMergeRequestIssueSync.objects.filter(
            repository=repository, merge_request_id=mr_data["id"]
        ).exclude(issue_id__in=touched_issue_ids).select_related("issue"):
            previous_last_synced_at = existing_sync.last_synced_at
            sync_row, _ = engine.upsert_merge_request_sync(repository, existing_sync.issue, mr_data)
            touched_syncs.append(sync_row)
            if settings_row is not None:
                changes = engine.sync_issue_metadata(
                    existing_sync.issue, mr_data, settings_row, previous_last_synced_at, actor
                )
                engine.dispatch_metadata_sync_activity(existing_sync.issue, changes, sync_row, actor)

        if settings_row is not None:
            trigger = engine.determine_trigger(action, mr_data, payload.get("changes"))
            if trigger:
                for sync_row in touched_syncs:
                    engine.apply_transition(sync_row.issue, settings_row, trigger, actor, sync_row)
    except Exception as e:
        log_exception(e)
