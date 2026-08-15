# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Sentry inbound-webhook business logic - see
docs/feature-specs/07-integrations-git.md ("5. Integration Sentry
native") in plane-selfhost.

Deliberately plain functions, not a Celery task (unlike the outbound sync
side, `plane.bgtasks.sentry_sync_task`) - the public webhook view
(`plane.space.views.sentry_webhook`) calls these directly, synchronously,
inside the request/response cycle. Only outbound calls to third-party
APIs are required to be asynchronous (exigence 12) - this module never
calls out to Sentry, so there is nothing to protect the request from, and
keeping it synchronous means the webhook response can honestly reflect
whether processing succeeded rather than always returning 200 before
anything ran.

**Cross-tenant isolation (verified by a dedicated pytest scenario, see
the session's test suite)**: every single lookup below is scoped through
`connection` (a `WorkspaceSentryConnection` resolved from the webhook
URL's own UUID path segment) - `SentryProjectSync` is looked up via
`connection.project_syncs`, `IssueSentryDetail` via
`workspace_id=connection.workspace_id`. A crafted payload naming a
`sentry_project_slug`/`sentry_issue_id` that belongs to a different
workspace's connection can therefore never match a row scoped to *this*
connection - it silently falls into the same "unmapped project, ignore"
path as a genuinely unmapped Sentry project (mirrors the GitHub-native
spec's own exigence 11 for the identical cross-tenant shape).
"""

from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    IntegrationEventDirection,
    IntegrationEventLog,
    IntegrationProvider,
    IssueSentryDetail,
    Label,
    Notification,
    SentrySyncStatus,
    State,
    StateGroup,
)
from plane.db.models.user import BotTypeEnum
from plane.utils.integration_bot import get_or_create_integration_bot

LEVEL_TO_PRIORITY = {
    "fatal": "urgent",
    "error": "high",
    "warning": "medium",
    "info": "low",
    "debug": "low",
}

# Exigence 6 - which Plane StateGroup each real Sentry issue action maps
# to. "archived" is Sentry's current terminology for what used to be
# (and is still called, in some API surfaces/the spec's own wording)
# "ignored" - both are accepted as synonyms (verified against Sentry's
# own live-fetched webhook docs during this session, which show `action`
# values `created|resolved|assigned|archived|unresolved`, not a literal
# `"ignored"`).
_RESOLVE_ACTIONS = {"resolved"}
_IGNORE_ACTIONS = {"archived", "ignored"}
_REOPEN_ACTIONS = {"unresolved"}


def _log(workspace_id, connector_id, event_type, external_event_id, payload, response_status="200", error_message=None):
    IntegrationEventLog.objects.create(
        workspace_id=workspace_id,
        provider=IntegrationProvider.SENTRY,
        connector_id=connector_id,
        direction=IntegrationEventDirection.INBOUND,
        event_type=event_type,
        external_event_id=external_event_id,
        payload=payload,
        response_status=response_status,
        error_message=error_message,
    )


def _already_processed(connector_id, external_event_id):
    if not external_event_id:
        return False
    return IntegrationEventLog.objects.filter(
        connector_id=connector_id,
        direction=IntegrationEventDirection.INBOUND,
        external_event_id=external_event_id,
    ).exists()


def _find_active_project_sync(connection, sentry_project_slug):
    if not sentry_project_slug:
        return None
    return connection.project_syncs.filter(sentry_project_slug=sentry_project_slug, is_active=True).select_related(
        "project", "default_state", "resolved_state", "reopen_state", "label"
    ).first()


def _find_existing_detail(connection, sentry_issue_id):
    return (
        IssueSentryDetail.objects.filter(workspace_id=connection.workspace_id, sentry_issue_id=sentry_issue_id)
        .select_related("issue", "issue__state", "project_sync", "project_sync__project")
        .first()
    )


def _get_or_create_label(project_sync):
    if project_sync.label_id:
        return project_sync.label
    label, _ = Label.objects.get_or_create(
        project_id=project_sync.project_id,
        name="Sentry",
        defaults={"color": "#8e5cf6", "workspace_id": project_sync.workspace_id},
    )
    project_sync.label = label
    project_sync.save(update_fields=["label"])
    return label


def _create_issue_from_sentry(connection, sentry_project_slug, issue_data, external_event_id):
    project_sync = _find_active_project_sync(connection, sentry_project_slug)
    if project_sync is None:
        # Exigence 11 (GitHub spec) analog - a Sentry project not mapped
        # to any Plane project is silently ignored, not an error.
        return {"status": "ignored", "reason": "sentry project not mapped"}

    from plane.app.serializers import IssueCreateSerializer
    from crum import impersonate

    bot = get_or_create_integration_bot(project_sync.workspace, BotTypeEnum.SENTRY_BOT)
    label = _get_or_create_label(project_sync)

    level = (issue_data.get("level") or "error").lower()
    priority = LEVEL_TO_PRIORITY.get(level, "medium")
    title = issue_data.get("title") or issue_data.get("culprit") or "Sentry error"
    culprit = issue_data.get("culprit") or ""
    permalink = issue_data.get("permalink") or issue_data.get("url") or issue_data.get("web_url") or ""
    description_html = (
        f"<p><strong>Culprit:</strong> {culprit}</p>"
        f"<p><a href=\"{permalink}\">Open in Sentry</a></p>"
        if permalink
        else f"<p><strong>Culprit:</strong> {culprit}</p>"
    )

    payload = {
        "name": title[:255],
        "description_html": description_html,
        "priority": priority,
        "label_ids": [str(label.id)],
    }
    if project_sync.default_state_id:
        payload["state_id"] = str(project_sync.default_state_id)

    with impersonate(bot):
        serializer = IssueCreateSerializer(
            data=payload,
            context={
                "project_id": project_sync.project_id,
                "workspace_id": project_sync.workspace_id,
                "default_assignee_id": None,
            },
        )
        serializer.is_valid(raise_exception=True)
        issue = serializer.save(
            external_source="SENTRY",
            external_id=str(issue_data.get("id")),
        )

    detail = IssueSentryDetail.objects.create(
        issue=issue,
        project_id=project_sync.project_id,
        project_sync=project_sync,
        sentry_issue_id=str(issue_data.get("id")),
        sentry_short_id=issue_data.get("shortId") or "",
        permalink=permalink,
        level=level,
        status=SentrySyncStatus.UNRESOLVED,
        event_count=_safe_int(issue_data.get("count")),
        last_seen_at=_parse_datetime(issue_data.get("lastSeen")),
        last_synced_at=timezone.now(),
    )

    issue_activity.delay(
        type="issue.activity.created",
        requested_data=None,
        current_instance=None,
        issue_id=str(issue.id),
        actor_id=str(bot.id),
        project_id=str(project_sync.project_id),
        epoch=int(timezone.now().timestamp()),
        notification=False,
        is_automation=True,
        integration_sync_origin="sentry",
    )

    return {"status": "created", "issue_id": str(issue.id), "detail_id": str(detail.id)}


def _first_state_in_group(project_sync, group):
    return State.objects.filter(project_id=project_sync.project_id, group=group).order_by("sequence").first()


def _resolve_resolved_state(project_sync):
    return project_sync.resolved_state or _first_state_in_group(project_sync, StateGroup.COMPLETED.value)


def _resolve_ignored_state(project_sync):
    # Exigence 6 requires a "groupe Annulé" destination for `ignored`, but
    # the spec's own data model only names 3 state FKs
    # (default/resolved/reopen) - no dedicated "ignored_state" FK exists.
    # Resolved here by falling back to the project's first CANCELLED-group
    # state, documented as a deliberate spec-gap resolution (see
    # sentry_integration.py module docstring).
    return _first_state_in_group(project_sync, StateGroup.CANCELLED.value)


def _resolve_reopen_state(project_sync):
    # "un état configurable du groupe À faire/En cours" (exigence 6) - the
    # admin picks whichever group `reopen_state` belongs to when
    # configuring it; this function doesn't re-validate that group, it
    # just falls back to a default UNSTARTED-group state when unset.
    return project_sync.reopen_state or _first_state_in_group(project_sync, StateGroup.UNSTARTED.value)


def _update_issue_from_sentry(detail, action, issue_data, external_event_id):
    if not detail.is_sync_active or detail.project_sync is None:
        return {"status": "ignored", "reason": "sync inactive"}

    project_sync = detail.project_sync
    issue = detail.issue
    bot = get_or_create_integration_bot(project_sync.workspace, BotTypeEnum.SENTRY_BOT)

    updates = {}
    if issue_data.get("count") is not None:
        detail.event_count = _safe_int(issue_data.get("count"))
        updates["event_count"] = detail.event_count
    if issue_data.get("lastSeen"):
        detail.last_seen_at = _parse_datetime(issue_data.get("lastSeen"))
        updates["last_seen_at"] = detail.last_seen_at

    target_state = None
    new_status = None
    comment_text = None

    if action in _RESOLVE_ACTIONS:
        target_state = _resolve_resolved_state(project_sync)
        new_status = SentrySyncStatus.RESOLVED
    elif action in _IGNORE_ACTIONS:
        target_state = _resolve_ignored_state(project_sync)
        new_status = SentrySyncStatus.IGNORED
    elif action in _REOPEN_ACTIONS:
        # Exigence 6 - regression: only meaningful if the issue was
        # previously resolved/ignored in Plane; a Sentry issue that never
        # left "unresolved" sending another "unresolved" action is a
        # no-op, not a reopening.
        if detail.status in (SentrySyncStatus.RESOLVED, SentrySyncStatus.IGNORED):
            target_state = _resolve_reopen_state(project_sync)
            new_status = SentrySyncStatus.UNRESOLVED
            comment_text = "Sentry: this issue has reappeared (regression) and was automatically reopened."
    # "assigned" and any other action: no Plane-side state effect (hors
    # perimetre - see module docstring's "assigned" note).

    if new_status is not None:
        if target_state is not None and issue.state_id != target_state.id:
            old_state_id = str(issue.state_id) if issue.state_id else None
            issue.state = target_state
            issue.save(update_fields=["state_id", "completed_at"])
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=_json({"state_id": str(target_state.id)}),
                current_instance=_json({"state_id": old_state_id}),
                issue_id=str(issue.id),
                actor_id=str(bot.id),
                project_id=str(issue.project_id),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                is_automation=True,
                integration_sync_origin="sentry",
            )
        detail.status = new_status

    if comment_text:
        _create_bot_comment(issue, bot, comment_text)
        _notify_regression(issue)

    updates["status"] = detail.status
    detail.last_synced_at = timezone.now()
    updates["last_synced_at"] = detail.last_synced_at
    detail.save(update_fields=list(set(updates.keys()) | {"status", "last_synced_at"}))

    return {"status": "updated", "issue_id": str(issue.id), "new_status": detail.status}


def handle_issue_event(connection, action, data, external_event_id):
    """resource == "issue" (per `Sentry-Hook-Resource` header) - action in
    created/resolved/archived/ignored/unresolved/assigned."""
    issue_data = (data or {}).get("issue") or {}
    sentry_issue_id = str(issue_data.get("id") or "")
    if not sentry_issue_id:
        return {"status": "ignored", "reason": "missing issue id"}

    if _already_processed(connection.id, external_event_id):
        return {"status": "duplicate"}

    project_data = issue_data.get("project") or {}
    sentry_project_slug = project_data.get("slug")

    existing_detail = _find_existing_detail(connection, sentry_issue_id)

    if existing_detail is not None:
        result = _update_issue_from_sentry(existing_detail, action, issue_data, external_event_id)
    elif action == "created":
        result = _create_issue_from_sentry(connection, sentry_project_slug, issue_data, external_event_id)
    else:
        result = {"status": "ignored", "reason": "unknown sentry issue and not a created event"}

    _log(connection.workspace_id, connection.id, f"issue.{action}", external_event_id, {
        "sentry_issue_id": sentry_issue_id, "action": action, "result": result.get("status")
    })
    return result


def handle_event_alert(connection, data, external_event_id):
    """resource == "event_alert" (per `Sentry-Hook-Resource` header) - a
    new event matched an Alert Rule (real Sentry mechanism used to get a
    webhook per-*occurrence*, since `issue` resource webhooks only fire on
    lifecycle transitions, not every repeat event). Exigence 4 - throttled
    "+N occurrences" comment."""
    event_data = (data or {}).get("event") or {}
    sentry_issue_id = str(event_data.get("issue_id") or "")
    if not sentry_issue_id:
        return {"status": "ignored", "reason": "missing issue_id"}

    if _already_processed(connection.id, external_event_id):
        return {"status": "duplicate"}

    detail = _find_existing_detail(connection, sentry_issue_id)
    if detail is None or detail.project_sync is None or not detail.is_sync_active:
        _log(
            connection.workspace_id,
            connection.id,
            "event_alert",
            external_event_id,
            {"sentry_issue_id": sentry_issue_id},
        )
        return {"status": "ignored", "reason": "unknown or inactive sentry issue"}

    project_sync = detail.project_sync
    result = {"status": "ignored", "reason": "sync_comments_on_new_events disabled"}
    if project_sync.sync_comments_on_new_events:
        throttle = project_sync.comment_throttle_minutes or 60
        now = timezone.now()
        elapsed_since_last_comment = (
            None if detail.last_occurrence_comment_at is None else (now - detail.last_occurrence_comment_at)
        )
        if elapsed_since_last_comment is None or elapsed_since_last_comment.total_seconds() >= throttle * 60:
            bot = get_or_create_integration_bot(project_sync.workspace, BotTypeEnum.SENTRY_BOT)
            _create_bot_comment(detail.issue, bot, "Sentry: +1 occurrence(s) since the last sync.")
            detail.last_occurrence_comment_at = now
            detail.event_count = detail.event_count + 1
            detail.save(update_fields=["last_occurrence_comment_at", "event_count"])
            result = {"status": "commented"}
        else:
            result = {"status": "throttled"}

    _log(connection.workspace_id, connection.id, "event_alert", external_event_id, {
        "sentry_issue_id": sentry_issue_id, "result": result.get("status")
    })
    return result


def _create_bot_comment(issue, bot, text):
    from plane.db.models import IssueComment

    comment = IssueComment(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        actor_id=bot.id,
        comment_html=f"<p>{text}</p>",
        created_by_automation=True,
    )
    comment.save(created_by_id=bot.id, disable_auto_set_user=True)
    return comment


def _notify_regression(issue):
    """Exigence 6 - "notification des assignés et du créateur" on
    regression reopen."""
    receiver_ids = set(issue.assignees.values_list("id", flat=True))
    if issue.created_by_id:
        receiver_ids.add(issue.created_by_id)
    if not receiver_ids:
        return
    title = f'Sentry issue reopened for "{issue.name}"'
    message = "This issue regressed in Sentry and was automatically reopened."
    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=issue.workspace_id,
                project_id=issue.project_id,
                entity_identifier=issue.id,
                entity_name="ISSUE_SENTRY_REGRESSION",
                title=title,
                message=[{"data": message}],
                message_stripped=message,
                sender="in_app:sentry:regression",
                receiver_id=receiver_id,
            )
            for receiver_id in receiver_ids
        ]
    )


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _parse_datetime(value):
    if not value:
        return None
    from django.utils.dateparse import parse_datetime

    parsed = parse_datetime(value)
    return parsed


def _json(data):
    import json

    return json.dumps(data)
