# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Notifications for View Subscriptions - see
docs/feature-specs/04-views-filters.md ("Abonnements/notifications par
vue") in plane-selfhost. Direct-send email (no HTML template), same
pattern as project_update_task.py and for the same reason: the main issue
notification digest pipeline (email_notification_task.py) is hardcoded to
Issue-shaped context tied to IssueSubscriber/UserNotificationPreference,
not a saved-view subscription.
"""

from celery import shared_task

from plane.bgtasks.project_update_task import _send_plain_email

NOTIFY_FIELD_BY_EVENT = {
    "add": "notify_on_add",
    "complete": "notify_on_complete",
    "cancel": "notify_on_cancel",
}
EVENT_LABEL = {
    "add": "now matches",
    "complete": "was completed while matching",
    "cancel": "was cancelled while matching",
}


@shared_task
def notify_view_subscribers(issue_id, view_id, event, actor_id=None):
    """event is one of "add" | "complete" | "cancel" - see
    IssueViewSet.partial_update (app/views/issue/base.py) for the
    membership-change detection that triggers this task.
    """
    from plane.db.models import Issue, IssueView, Notification, ViewSubscription

    notify_field = NOTIFY_FIELD_BY_EVENT.get(event)
    if notify_field is None:
        return

    issue = Issue.objects.filter(pk=issue_id).first()
    issue_view = IssueView.objects.filter(pk=view_id).first()
    if issue is None or issue_view is None:
        return

    subscriptions = (
        ViewSubscription.objects.filter(issue_view_id=view_id, is_active=True, **{notify_field: True})
        .exclude(subscriber_id=actor_id)
        .select_related("subscriber")
    )

    title = f'"{issue.name}" {EVENT_LABEL[event]} view "{issue_view.name}"'

    to_emails = []
    for subscription in subscriptions:
        Notification.objects.create(
            workspace_id=issue_view.workspace_id,
            project_id=issue_view.project_id,
            entity_identifier=issue.id,
            entity_name="VIEW_SUBSCRIPTION",
            title=title,
            message=[{"data": title}],
            message_stripped=title,
            sender=f"in_app:view_subscription:{event}",
            triggered_by_id=actor_id,
            receiver_id=subscription.subscriber_id,
        )
        if subscription.notify_by_email and subscription.subscriber.email:
            to_emails.append(subscription.subscriber.email)

    if to_emails:
        _send_plain_email(title, title, to_emails)
