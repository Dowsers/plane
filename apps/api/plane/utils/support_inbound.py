# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Support-ticket inbound webhook business logic (Zendesk/Front/generic) -
see docs/feature-specs/07-integrations-git.md ("6. Pont support client
type Zendesk/Front") in plane-selfhost.

Single entry point, `process_inbound_ticket_event`, handles both exigence
4(b) ("réception d'un webhook entrant du provider portant l'action
créer/lier") and exigence 13's "le webhook entrant de mise à jour de
statut de ticket ne modifie que les métadonnées de contexte... jamais
l'état de l'item" in one uniform create-or-update-by-`external_ticket_id`
flow, rather than branching on a provider-specific "action" field (Front
has one; Zendesk/generic_webhook payloads are admin-defined Trigger
templates with no guaranteed action field - see support_client.py). This
also means REQ13's "never touches issue state" guarantee is structural,
not a per-branch discipline that could be broken by a future edit: there
is exactly one code path for an already-linked ticket
(`_update_ticket_context`), and it has no access to a State object at
all, so it cannot regress into changing `issue.state` even by mistake.

Exigence 7 - a newly created ticket's issue goes into the project's
**Intake**, not directly onto the board, reusing the real
`IntakeIssueViewSet.create()` shape (plane/app/views/intake/base.py) -
`IssueCreateSerializer` + a `db.Intake` row + a `db.IntakeIssue` row - and
gets `intake_issue.support_ticket` set (see the field added on
`IntakeIssue` in plane/db/models/intake.py) so the Intake view's "origine:
support" filter can find it.
"""

from crum import impersonate
from django.utils import timezone

from plane.app.serializers import IssueCreateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Intake,
    IntakeIssue,
    IntegrationEventDirection,
    IntegrationEventLog,
    IntegrationProvider,
    IssueSupportTicket,
    State,
    StateGroup,
    SupportTicketSyncState,
)
from plane.db.models.user import BotTypeEnum
from plane.utils.integration_bot import get_or_create_integration_bot
from plane.utils.support_client import extract_ticket_fields_from_payload

_PROVIDER_TO_LOG_PROVIDER = {
    "zendesk": IntegrationProvider.ZENDESK,
    "front": IntegrationProvider.FRONT,
    "generic_webhook": IntegrationProvider.GENERIC_WEBHOOK,
}


def _log(connector, event_type, external_event_id, payload, error_message=None):
    IntegrationEventLog.objects.create(
        workspace_id=connector.workspace_id,
        provider=_PROVIDER_TO_LOG_PROVIDER.get(connector.provider, IntegrationProvider.GENERIC_WEBHOOK),
        connector_id=connector.id,
        direction=IntegrationEventDirection.INBOUND,
        event_type=event_type,
        external_event_id=external_event_id,
        payload=payload,
        response_status="200",
        error_message=error_message,
    )


def _resolve_intake_state(project):
    """Mirrors IntakeIssueViewSet.create()'s own triage-state
    get-or-create fallback exactly (plane/app/views/intake/base.py) -
    exigence 7's "l'état Triage du projet à défaut"."""
    triage_state = State.triage_objects.filter(project_id=project.id, workspace_id=project.workspace_id).first()
    if not triage_state:
        triage_state = State.objects.create(
            name="Triage",
            group=StateGroup.TRIAGE.value,
            project_id=project.id,
            workspace_id=project.workspace_id,
            color="#4E5355",
            sequence=65000,
            default=False,
        )
    return triage_state


def _update_ticket_context(ticket, fields):
    """Exigence 13 - metadata-only refresh. Never touches `ticket.issue`'s
    state - this function has no State object in scope at all."""
    if fields.get("requester_email") is not None:
        ticket.requester_email = fields["requester_email"]
    if fields.get("requester_name") is not None:
        ticket.requester_name = fields["requester_name"]
    if fields.get("subject"):
        ticket.subject = fields["subject"][:500]
    if fields.get("priority") is not None:
        ticket.priority = (fields["priority"] or "")[:50]
    if fields.get("tags") is not None:
        ticket.tags = fields["tags"]
    if fields.get("status") is not None:
        ticket.last_synced_status = (fields["status"] or "")[:100]
    if fields.get("last_message") is not None:
        # Exigence 17 - hard-capped at 300 characters at the application
        # layer too (not just the DB column's max_length), so a
        # provider-side change in message length degrades gracefully.
        ticket.last_message_snippet = (fields["last_message"] or "")[:300]
    ticket.sync_state = SupportTicketSyncState.SYNCED
    ticket.last_synced_at = timezone.now()
    ticket.save()
    return ticket


def _create_ticket_and_intake_issue(connector, ticket_id, fields, external_event_id):
    if connector.default_project_id is None:
        _log(connector, "ticket.ignored", external_event_id, {"ticket_id": ticket_id})
        return {"status": "ignored", "reason": "connector has no default_project configured"}

    project = connector.default_project
    bot = get_or_create_integration_bot(connector.workspace, BotTypeEnum.SUPPORT_BOT)
    target_state = connector.default_state or _resolve_intake_state(project)

    subject = (fields.get("subject") or f"Support ticket #{ticket_id}")[:255]
    last_message = fields.get("last_message") or ""

    with impersonate(bot):
        serializer = IssueCreateSerializer(
            data={
                "name": subject,
                "description_html": f"<p>{last_message}</p>" if last_message else "<p></p>",
                "state_id": str(target_state.id),
            },
            context={
                "project_id": project.id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
                "allow_triage_state": True,
            },
        )
        serializer.is_valid(raise_exception=True)
        issue = serializer.save(
            external_source=connector.provider.upper(),
            external_id=str(ticket_id),
        )

    intake = Intake.objects.filter(project=project).first()
    ticket = IssueSupportTicket.objects.create(
        issue=issue,
        project=project,
        connector=connector,
        external_ticket_id=str(ticket_id),
        external_ticket_url=fields.get("url") or "",
        requester_email=fields.get("requester_email"),
        requester_name=fields.get("requester_name"),
        subject=subject[:500],
        priority=(fields.get("priority") or "")[:50],
        tags=fields.get("tags") or [],
        last_synced_status=(fields.get("status") or "")[:100],
        last_message_snippet=last_message[:300],
        sync_state=SupportTicketSyncState.SYNCED,
        last_synced_at=timezone.now(),
    )

    intake_issue = IntakeIssue.objects.create(
        intake=intake,
        project_id=project.id,
        issue=issue,
        source=connector.provider.upper(),
        support_ticket=ticket,
    )

    issue_activity.delay(
        type="issue.activity.created",
        requested_data=None,
        current_instance=None,
        issue_id=str(issue.id),
        actor_id=str(bot.id),
        project_id=str(project.id),
        epoch=int(timezone.now().timestamp()),
        notification=False,
        is_automation=True,
        integration_sync_origin="support",
    )

    _log(connector, "ticket.created", external_event_id, {"ticket_id": ticket_id})
    return {
        "status": "created",
        "issue_id": str(issue.id),
        "ticket_id": str(ticket.id),
        "intake_issue_id": str(intake_issue.id),
    }


def _already_processed(connector_id, external_event_id):
    """Delivery-level idempotency check (distinct from, and in addition
    to, the ticket-level `(connector, external_ticket_id)` dedup below) -
    protects a *retried delivery of the exact same webhook event* (a
    provider-supplied delivery id) from being processed twice, cheaper
    than falling through to the full ticket lookup. Only effective when
    the provider payload carries a stable id - Zendesk's admin-templated
    Trigger payloads don't guarantee one, so this is a best-effort
    additional layer, not the only one; the ticket-level check below is
    what REQ6 actually mandates and is what remains correct even when no
    delivery id is available."""
    if not external_event_id:
        return False
    return IntegrationEventLog.objects.filter(
        connector_id=connector_id,
        direction=IntegrationEventDirection.INBOUND,
        external_event_id=external_event_id,
    ).exists()


def process_inbound_ticket_event(connector, payload, external_event_id=None):
    """
    Idempotent create-or-update, keyed by `(connector, external_ticket_id)`
    - exigence 6. Returns a dict with at least a `status` key
    (`created`/`updated`/`ignored`/`duplicate`).
    """
    if _already_processed(connector.id, external_event_id):
        return {"status": "duplicate"}

    fields = extract_ticket_fields_from_payload(connector, payload)
    ticket_id = fields.get("ticket_id")
    if not ticket_id:
        _log(connector, "ticket.ignored", external_event_id, {"reason": "missing ticket_id"})
        return {"status": "ignored", "reason": "missing ticket_id"}

    existing = IssueSupportTicket.objects.filter(connector=connector, external_ticket_id=str(ticket_id)).first()
    if existing is not None:
        _update_ticket_context(existing, fields)
        _log(connector, "ticket.updated", external_event_id, {"ticket_id": ticket_id})
        return {"status": "updated", "issue_id": str(existing.issue_id), "ticket_id": str(existing.id)}

    return _create_ticket_and_intake_issue(connector, ticket_id, fields, external_event_id)
