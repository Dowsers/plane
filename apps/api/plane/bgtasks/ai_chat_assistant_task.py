# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 3 - "Assistant de chat IA in-app", exigence 1b/7 -
the `@AI Assistant` comment-mention path. Hooked from
`plane.app.views.issue.comment.IssueCommentViewSet.create` (best-effort,
`.delay()`'d exactly like that view's existing `sync_issue_comment_to_slack`
call, so posting a human's comment never blocks on an LLM round-trip).

Reuses the EXISTING mention-extraction mechanism
(`plane.bgtasks.notification_task.extract_comment_mentions`, the same
function feature 5's digest already reuses for its own `COMMENT_MENTION`
digest items) rather than re-deriving `@mention` parsing, and posts the
reply through the same `IssueCommentSerializer` + `issue_activity` path
every human comment already uses (see
`plane.app.views.issue.comment.IssueCommentViewSet.create`) - no parallel
comment-creation path.
"""

import json

from celery import shared_task
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

from plane.utils.exception_logger import log_exception


@shared_task
def handle_comment_mention(comment_id):
    try:
        from plane.app.serializers import IssueCommentSerializer
        from plane.bgtasks.issue_activities_task import issue_activity
        from plane.bgtasks.notification_task import extract_comment_mentions
        from plane.db.models import (
            AIConversation,
            AIConversationSource,
            AIMessage,
            AIMessageMode,
            AIMessageRole,
            AIMessageStatus,
            IssueComment,
            User,
        )
        from plane.db.models.user import BotTypeEnum
        from plane.utils.ai_chat_assistant import generate_assistant_reply, is_ai_assistant_available_for_context

        comment = (
            IssueComment.objects.filter(id=comment_id)
            .select_related("issue", "project", "workspace", "actor")
            .first()
        )
        if comment is None or comment.issue is None:
            return

        mentioned_ids = extract_comment_mentions(comment.comment_html)
        if not mentioned_ids:
            return

        bot = User.objects.filter(
            id__in=mentioned_ids, is_bot=True, bot_type=BotTypeEnum.AI_ASSISTANT_BOT
        ).first()
        if bot is None:
            return  # The AI Assistant wasn't actually among the mentions.

        workspace = comment.workspace
        available, _error = is_ai_assistant_available_for_context(workspace, "issue", comment.issue_id)
        if not available:
            return

        issue = comment.issue

        conversation, _created = AIConversation.objects.get_or_create(
            workspace=workspace,
            context_type="issue",
            context_object_id=issue.id,
            source=AIConversationSource.COMMENT_MENTION,
            created_by=comment.actor,
            defaults={"title": issue.name[:255]},
        )

        user_message = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.USER,
            content=comment.comment_stripped or "",
            mode=AIMessageMode.ASK,
            status=AIMessageStatus.COMPLETED,
        )
        assistant_message = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.ASSISTANT,
            content="",
            mode=AIMessageMode.ASK,
            status=AIMessageStatus.PENDING,
        )

        generate_assistant_reply(conversation, user_message, assistant_message)

        if assistant_message.status != AIMessageStatus.COMPLETED or not assistant_message.content:
            return

        reply_html = f"<p>{assistant_message.content}</p>"
        reply_serializer = IssueCommentSerializer(data={"comment_html": reply_html})
        if not reply_serializer.is_valid():
            return

        reply_serializer.save(
            project_id=comment.project_id,
            issue_id=issue.id,
            actor=bot,
            ai_conversation=conversation,
        )

        issue_activity(
            type="comment.activity.created",
            requested_data=json.dumps(reply_serializer.data, cls=DjangoJSONEncoder),
            actor_id=str(bot.id),
            issue_id=str(issue.id),
            project_id=str(comment.project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=None,
        )
    except Exception as e:
        log_exception(e)
