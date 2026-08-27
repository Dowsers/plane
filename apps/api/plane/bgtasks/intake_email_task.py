# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Celery tasks for the email intake channel's outbound half - see
docs/feature-specs/14-pricing-gap-remediation.md ("14d. Intake Email and
Slack (levee du squelette)", section 1, exigence 10) in plane-selfhost.

Mirrors plane.bgtasks.slack_sync_task's shape (best-effort, all
exceptions caught and logged, never raised back to the caller that fired
`.delay()`), but for the email channel's reply-notification half: when a
team member comments on an issue that was created from an inbound email,
the comment is emailed back to the original sender so the conversation
stays in their inbox rather than requiring them to have a Plane account.
"""

import logging
import uuid

from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils.html import strip_tags

from celery import shared_task

from plane.db.models import EmailIssueThread, IssueComment
from plane.db.models.intake_channel import EMAIL_INTAKE_EXTERNAL_SOURCE
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.api")


@shared_task
def send_issue_comment_email_reply(comment_id):
    """
    Exigence 10 - notifies the original external sender by email when a
    team member comments on an issue created from their inbound email.
    No-ops (does not send) when:
    - the comment itself arrived FROM an inbound email reply (anti-loop,
      same `external_source` convention as
      slack_sync_task.sync_issue_comment_to_slack) - re-emailing a reply
      we just received back to its own sender would be a silent echo.
    - the issue has no EmailIssueThread at all (never created from email,
      or created from email but the originating IntakeChannel/alias no
      longer exists).
    """
    try:
        comment = IssueComment.objects.filter(pk=comment_id).select_related("issue", "actor", "workspace").first()
        if comment is None:
            return
        if comment.external_source == "email":
            return

        issue = comment.issue
        if issue is None or issue.external_source != EMAIL_INTAKE_EXTERNAL_SOURCE or not issue.external_id:
            return

        original_sender = issue.external_id
        author_name = comment.actor.display_name if comment.actor else "Plane"
        html_content = comment.comment_html or f"<p>{comment.comment_stripped}</p>"
        text_content = comment.comment_stripped or strip_tags(html_content)

        (
            EMAIL_HOST,
            EMAIL_HOST_USER,
            EMAIL_HOST_PASSWORD,
            EMAIL_PORT,
            EMAIL_USE_TLS,
            EMAIL_USE_SSL,
            EMAIL_FROM,
        ) = get_email_configuration()

        connection = get_connection(
            host=EMAIL_HOST,
            port=int(EMAIL_PORT),
            username=EMAIL_HOST_USER,
            password=EMAIL_HOST_PASSWORD,
            use_tls=EMAIL_USE_TLS == "1",
            use_ssl=EMAIL_USE_SSL == "1",
        )

        subject = f"Re: {issue.name}"
        # A stable, unique Message-ID for THIS outbound email - recorded
        # on a fresh EmailIssueThread row keyed by outbound_message_id so
        # a subsequent reply's In-Reply-To/References header can be
        # matched back to this exact issue (exigence 9).
        message_id = f"<{uuid.uuid4().hex}@plane-intake>"

        msg = EmailMultiAlternatives(
            subject=subject,
            body=f"{author_name} replied:\n\n{text_content}",
            from_email=EMAIL_FROM,
            to=[original_sender],
            connection=connection,
            headers={"Message-ID": message_id},
        )
        msg.attach_alternative(f"<p><strong>{author_name}</strong> replied:</p>{html_content}", "text/html")
        msg.send()

        intake_channel_id = (
            EmailIssueThread.objects.filter(issue_id=issue.id).values_list("intake_channel_id", flat=True).first()
        )
        if intake_channel_id is not None:
            EmailIssueThread.objects.create(
                issue_id=issue.id,
                intake_channel_id=intake_channel_id,
                project_id=comment.project_id,
                workspace_id=comment.workspace_id,
                outbound_message_id=message_id,
                source="created_from_email",
            )
    except Exception as e:
        log_exception(e)

