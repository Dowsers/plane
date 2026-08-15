# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Celery tasks for the Slack app's async surfaces - see
docs/feature-specs/07-integrations-git.md ("3. App Slack open-source") in
plane-selfhost, docker/api/slack-app/README.md.
"""

import logging

from celery import shared_task

from plane.db.models import (
    IssueComment,
    SlackChannelProjectMapping,
    SlackIssueThread,
    SlackNotificationLog,
    SlackWorkspaceConnection,
)
from plane.utils.exception_logger import log_exception
from plane.utils.slack_client import SlackAPIError, post_message

logger = logging.getLogger("plane.api")


@shared_task
def sync_issue_comment_to_slack(comment_id):
    """
    Plane -> Slack half of exigence 8/10's bidirectional comment sync.

    Anti-loop: refuses to forward any comment whose `external_source`
    is "slack" - that means the comment ITSELF arrived from Slack (see
    SlackEventsWebhookEndpoint), so re-posting it back to the very thread
    it came from would be an infinite echo. This is the single choke
    point for that guarantee - every call site (IssueCommentViewSet.create
    and IssueCommentListCreateAPIEndpoint.post) calls this task
    unconditionally and relies on it to no-op safely rather than checking
    external_source itself, so there is exactly one place this rule can
    ever be gotten wrong.
    """
    try:
        comment = IssueComment.objects.filter(pk=comment_id).select_related("issue", "actor", "workspace").first()
        if comment is None:
            return
        if comment.external_source == "slack":
            return

        thread = SlackIssueThread.objects.filter(issue_id=comment.issue_id).first()
        if thread is None:
            return

        connection = SlackWorkspaceConnection.objects.filter(
            workspace_id=comment.workspace_id, is_active=True
        ).first()
        if connection is None:
            return

        author_name = comment.actor.display_name if comment.actor else "Plane"
        text = comment.comment_stripped or ""

        try:
            post_message(
                connection.bot_access_token,
                channel=thread.slack_channel_id,
                text=text,
                thread_ts=thread.slack_message_ts,
                username=author_name,
            )
            SlackNotificationLog.objects.create(
                workspace_id=comment.workspace_id,
                event_type="comment_added",
                payload_summary={"issue_id": str(comment.issue_id), "comment_id": str(comment.id)},
                status="sent",
            )
        except SlackAPIError as e:
            # Exigence 15 - Slack API errors are logged and never bubble
            # up to interrupt the Plane-side flow that triggered them
            # (this task is always fired via .delay(), so there is no
            # caller waiting on its result either way).
            SlackNotificationLog.objects.create(
                workspace_id=comment.workspace_id,
                event_type="comment_added",
                payload_summary={"issue_id": str(comment.issue_id), "comment_id": str(comment.id)},
                status="failed",
                error_message=str(e),
            )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_slack_channel_notifications(project_id, event_type, summary_text, payload_summary=None):
    """
    Exigence 11/12 - notifies every channel mapping for `project_id` whose
    `notify_on` includes `event_type`. SCOPING GUARANTEE: this task only
    ever queries `SlackChannelProjectMapping.objects.filter(project_id=...)`
    - it has no code path that can select a mapping belonging to a
    different project than the one the caller passed in, so a mapping can
    never receive an event for a project other than the one it was
    explicitly (and permission-checked, see
    SlackChannelProjectMappingViewSet.create) configured for. There is
    deliberately no "notify all mappings for this workspace" fallback
    anywhere in this module.
    """
    try:
        mappings = SlackChannelProjectMapping.objects.filter(
            project_id=project_id, is_active=True, notify_on__contains=[event_type]
        ).select_related("slack_connection")

        for mapping in mappings:
            connection = mapping.slack_connection
            if connection is None or not connection.is_active:
                continue
            try:
                post_message(connection.bot_access_token, channel=mapping.slack_channel_id, text=summary_text)
                SlackNotificationLog.objects.create(
                    workspace_id=mapping.workspace_id,
                    mapping=mapping,
                    event_type=event_type,
                    payload_summary=payload_summary or {},
                    status="sent",
                )
            except SlackAPIError as e:
                SlackNotificationLog.objects.create(
                    workspace_id=mapping.workspace_id,
                    mapping=mapping,
                    event_type=event_type,
                    payload_summary=payload_summary or {},
                    status="failed",
                    error_message=str(e),
                )
    except Exception as e:
        log_exception(e)
