# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Support-ticket outbound reopen sync - see
docs/feature-specs/07-integrations-git.md ("6. Pont support client type
Zendesk/Front", exigence 9/10/11/12/14) in plane-selfhost.

Dispatched from the single choke point in
`plane.bgtasks.issue_activities_task.issue_activity` (same choke point the
SLA/workflow-rule engines and the Sentry outbound sync already use)
whenever an issue's state changes into the `completed` or `cancelled`
group, gated by `integration_sync_origin != "support"` for symmetry with
the Sentry side. In practice this task can never be echo-triggered by its
own inbound webhook anyway - `plane.utils.support_inbound` never touches
`issue.state` at all (exigence 13) - but the guard costs nothing and keeps
both integrations' anti-loop story identical and easy to audit together.

Manual retry (not `autoretry_for`) mirrors `webhook_task.webhook_send_task`
and `sentry_sync_task` - per-attempt logging to `IntegrationEventLog` plus
a final-failure branch that needs a `sync_state=ERROR` write and a
notification (exigence 14), neither of which `autoretry_for`'s automatic
loop gives a hook for.
"""

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from plane.db.models import (
    Issue,
    IntegrationEventDirection,
    IntegrationEventLog,
    IntegrationProvider,
    IssueActivity,
    IssueSupportTicket,
    Notification,
    StateGroup,
    SupportTicketSyncState,
)
from plane.utils.exception_logger import log_exception
from plane.utils.support_client import SupportAPIError, reopen_ticket_and_note

_PROVIDER_MAP = {
    "zendesk": IntegrationProvider.ZENDESK,
    "front": IntegrationProvider.FRONT,
    "generic_webhook": IntegrationProvider.GENERIC_WEBHOOK,
}


def _log(ticket, event_type, response_status=None, error_message=None):
    IntegrationEventLog.objects.create(
        workspace_id=ticket.workspace_id,
        provider=_PROVIDER_MAP.get(ticket.connector.provider, IntegrationProvider.GENERIC_WEBHOOK),
        connector_id=ticket.connector_id,
        direction=IntegrationEventDirection.OUTBOUND,
        event_type=event_type,
        payload={"ticket_id": ticket.external_ticket_id},
        response_status=str(response_status) if response_status is not None else None,
        error_message=error_message,
    )


def _issue_deep_link(issue):
    base = (settings.WEB_URL or "").rstrip("/")
    return f"{base}/{issue.project.workspace.slug}/projects/{issue.project_id}/issues/{issue.id}"


def _note_body(issue, group):
    identifier = f"{issue.project.identifier}-{issue.sequence_id}"
    link = _issue_deep_link(issue)
    verb = "completed" if group == StateGroup.COMPLETED.value else "cancelled"
    # Exigence 12 - minimum content: Plane item id, new state, deep link.
    return f"Plane item {identifier} was marked {verb} ({issue.state.name}). {link}"


def _notify_sync_error(ticket, error_message):
    """Exigence 14 - "notification in-app... aux assignes de l'item"."""
    issue = ticket.issue
    receiver_ids = list(issue.assignees.values_list("id", flat=True))
    if not receiver_ids:
        return
    title = f'Support ticket sync failed for "{issue.name}"'
    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=ticket.workspace_id,
                project_id=ticket.project_id,
                entity_identifier=ticket.id,
                entity_name="ISSUE_SUPPORT_TICKET_SYNC_ERROR",
                title=title,
                message=[{"data": error_message}],
                message_stripped=error_message,
                sender="in_app:support:sync_error",
                receiver_id=receiver_id,
            )
            for receiver_id in receiver_ids
        ]
    )


@shared_task
def sync_issue_state_to_support_tickets(issue_id):
    """Exigence 9 - "Aucune autre transition d'état ne déclenche d'appel
    au provider" (only completed/cancelled do). A lightweight dispatcher
    only - it does not itself call any provider API or retry. Each linked
    ticket's own outbound call is enqueued as its own independent
    `sync_single_support_ticket` task (an issue can have more than one
    linked ticket, exigence-adjacent "plusieurs items" symmetric case) so
    that one ticket's retry/backoff can never re-post a duplicate note to
    a *different* ticket that already succeeded in the same triggering
    state change - a single shared-loop task retrying as a whole would
    have exactly that bug."""
    try:
        issue = Issue.objects.filter(pk=issue_id).select_related("state", "project", "project__workspace").first()
        if issue is None:
            return
        state_group = issue.state.group if issue.state else None
        if state_group not in (StateGroup.COMPLETED.value, StateGroup.CANCELLED.value):
            return

        note_body = _note_body(issue, state_group)
        ticket_ids = list(
            IssueSupportTicket.objects.filter(issue_id=issue_id, connector__is_enabled=True).values_list(
                "id", flat=True
            )
        )
        for ticket_id in ticket_ids:
            sync_single_support_ticket.delay(str(ticket_id), note_body)
    except Exception as e:
        log_exception(e)


@shared_task(bind=True, max_retries=3)
def sync_single_support_ticket(self, ticket_id, note_body):
    try:
        ticket = IssueSupportTicket.objects.filter(pk=ticket_id).select_related("connector", "issue").first()
        if ticket is None:
            return
        reopen_ticket_and_note(ticket.connector, ticket, note_body)
    except SupportAPIError as e:
        _log(ticket, "ticket.reopen", response_status=e.status_code, error_message=e.message)
        if self.request.retries >= self.max_retries:
            IssueSupportTicket.objects.filter(pk=ticket.id).update(
                sync_state=SupportTicketSyncState.ERROR,
                last_sync_error=e.message,
                reopen_retry_count=ticket.reopen_retry_count + 1,
            )
            _notify_sync_error(ticket, e.message)
            return
        IssueSupportTicket.objects.filter(pk=ticket.id).update(reopen_retry_count=ticket.reopen_retry_count + 1)
        self.retry(exc=e, countdown=2**self.request.retries * 10)
    except Exception as e:
        log_exception(e)
    else:
        _log(ticket, "ticket.reopen", response_status=200)
        IssueSupportTicket.objects.filter(pk=ticket.id).update(
            sync_state=SupportTicketSyncState.SYNCED,
            last_synced_status="open",
            last_synced_at=timezone.now(),
            last_sync_error=None,
        )
        # Spec's own "IssueActivity: pas de nouveau modele, mais nouvelles
        # valeurs de verb/field" bullet - created directly here (not
        # through the generic `issue_activity` task's fixed
        # ACTIVITY_MAPPER dispatch table, which has no entry for this
        # verb) so it shows up in the item's activity feed like any other
        # automated change.
        IssueActivity.objects.create(
            issue_id=ticket.issue_id,
            project_id=ticket.project_id,
            workspace_id=ticket.workspace_id,
            verb="support_ticket_reopened",
            field="support_ticket",
            new_value=ticket.external_ticket_id,
            comment=f"Reopened {ticket.connector.provider} ticket #{ticket.external_ticket_id}",
            is_automation=True,
        )
