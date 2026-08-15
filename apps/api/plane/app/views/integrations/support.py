# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Authenticated support-connector endpoints - see
docs/feature-specs/07-integrations-git.md ("6. Pont support client type
Zendesk/Front", "Considerations API / UX") in plane-selfhost.

Exigence 1 - connector configuration (create/modify/delete/rotate) is
Admin-only (workspace role, level 20); "les rôles Member/Viewer/Guest
n'ont pas accès à l'écran de configuration" - `SupportConnectorViewSet`
gates every verb, including read, to `ROLE.ADMIN` (same convention
`SLAPolicyViewSet`/`WorkflowRuleViewSet` already use for their own
config-screen-gating, see app/views/sla/base.py's own docstring for the
precedent).
"""

import secrets

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueSupportTicketSerializer, WorkspaceSupportConnectorSerializer
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueSupportTicket,
    SupportTicketSyncState,
    Workspace,
    WorkspaceSupportConnector,
)
from plane.utils.support_client import (
    SupportAPIError,
    extract_ticket_id_from_url,
    front_get_conversation,
    zendesk_get_ticket,
)

from ..base import BaseAPIView, BaseViewSet

# Exigence 18 - "1 rafraîchissement manuel / 30 s / lien".
MANUAL_REFRESH_MIN_INTERVAL_SECONDS = 30


class SupportConnectorViewSet(BaseViewSet):
    serializer_class = WorkspaceSupportConnectorSerializer
    model = WorkspaceSupportConnector

    def get_queryset(self):
        return super().get_queryset().filter(workspace__slug=self.kwargs.get("slug"))

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def list(self, request, slug):
        data = WorkspaceSupportConnectorSerializer(self.get_queryset(), many=True).data
        return Response(data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        provider = request.data.get("provider")
        if provider not in ("zendesk", "front", "generic_webhook"):
            return Response({"error": "Invalid provider"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        api_token = request.data.get("api_token", "")
        connector = WorkspaceSupportConnector.objects.create(
            workspace=workspace,
            provider=provider,
            name=request.data.get("name", provider),
            domain=request.data.get("domain", ""),
            api_token=api_token,
            token_last_4=api_token[-4:] if api_token else "",
            webhook_secret=request.data.get("webhook_secret", ""),
            default_project_id=request.data.get("default_project_id") or None,
            default_state_id=request.data.get("default_state_id") or None,
            reopen_ticket_on_resolve=request.data.get("reopen_ticket_on_resolve", True),
            reopen_note_visibility=request.data.get("reopen_note_visibility", "internal"),
            generic_field_mapping=request.data.get("generic_field_mapping") or {},
            connected_by=request.user,
        )
        return Response(WorkspaceSupportConnectorSerializer(connector).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        connector = self.get_queryset().filter(pk=pk).first()
        if connector is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        for field in (
            "name",
            "domain",
            "default_project_id",
            "default_state_id",
            "reopen_ticket_on_resolve",
            "reopen_note_visibility",
            "is_enabled",
            "generic_field_mapping",
        ):
            if field in request.data:
                setattr(connector, field, request.data[field])
        if "api_token" in request.data and request.data["api_token"]:
            connector.api_token = request.data["api_token"]
            connector.token_last_4 = request.data["api_token"][-4:]
        if "webhook_secret" in request.data and request.data["webhook_secret"]:
            connector.webhook_secret = request.data["webhook_secret"]
        connector.save()
        return Response(WorkspaceSupportConnectorSerializer(connector).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        # Exigence 15 - "conserve en lecture seule tous les liens... mais
        # arrête toute synchronisation future, sans jamais supprimer les
        # items Plane associés" - flip is_enabled off rather than a hard
        # delete, so `sync_issue_state_to_support_tickets`'s own
        # `connector__is_enabled=True` filter stops picking this
        # connector's tickets up, while every existing IssueSupportTicket
        # row (and the Plane issues they point to) survives untouched.
        connector = self.get_queryset().filter(pk=pk).first()
        if connector is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        connector.is_enabled = False
        connector.save(update_fields=["is_enabled"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SupportConnectorRotateSecretEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        connector = WorkspaceSupportConnector.objects.filter(workspace__slug=slug, pk=pk).first()
        if connector is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        connector.webhook_secret = secrets.token_urlsafe(32)
        connector.inbound_token = secrets.token_urlsafe(32)
        connector.save(update_fields=["webhook_secret", "inbound_token"])
        return Response(WorkspaceSupportConnectorSerializer(connector).data, status=status.HTTP_200_OK)


def _fetch_context_from_provider(connector, ticket_id):
    """Best-effort - used both by manual link (REQ "recherche par ID si un
    jeton API est configuré") and by the manual refresh endpoint. Returns
    a partial fields dict (never raises - a failed lookup just means the
    link is created/kept with whatever context is already known)."""
    try:
        if connector.provider == "zendesk" and connector.api_token:
            ticket = zendesk_get_ticket(connector.domain, connector.api_token, ticket_id)
            return {
                "subject": ticket.get("subject") or "",
                "status": ticket.get("status"),
                "priority": ticket.get("priority") or "",
                "tags": ticket.get("tags") or [],
                "requester_email": None,
            }
        if connector.provider == "front" and connector.api_token:
            conversation = front_get_conversation(connector.api_token, ticket_id)
            recipient = conversation.get("recipient") or {}
            return {
                "subject": conversation.get("subject") or "",
                "status": conversation.get("status"),
                "requester_email": recipient.get("handle"),
                "requester_name": recipient.get("name"),
            }
    except SupportAPIError:
        return {}
    return {}


class IssueSupportTicketViewSet(BaseViewSet):
    serializer_class = IssueSupportTicketSerializer
    model = IssueSupportTicket

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                issue_id=self.kwargs.get("issue_id"),
            )
            .select_related("connector")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_id):
        return Response(IssueSupportTicketSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        """Exigence 4(a) - manual link by URL, with provider-specific
        regex extraction; exigence 5 - idempotent no-op if already linked."""
        connector_id = request.data.get("connector_id")
        url = request.data.get("url")
        if not connector_id or not url:
            return Response({"error": "connector_id and url are required"}, status=status.HTTP_400_BAD_REQUEST)

        connector = WorkspaceSupportConnector.objects.filter(
            workspace__slug=slug, pk=connector_id, is_enabled=True
        ).first()
        if connector is None:
            return Response({"error": "Connector not found"}, status=status.HTTP_404_NOT_FOUND)

        ticket_id = extract_ticket_id_from_url(connector.provider, url)
        if ticket_id is None:
            return Response(
                {"error": "This URL isn't recognized as a valid ticket URL for this connector's provider"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue = Issue.objects.filter(pk=issue_id, project_id=project_id).first()
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 5 - "lier deux fois le même ticket au même item est un
        # no-op idempotent (retourne le lien existant, code 200)".
        existing = IssueSupportTicket.objects.filter(
            connector=connector, external_ticket_id=str(ticket_id), issue=issue
        ).first()
        if existing is not None:
            return Response(IssueSupportTicketSerializer(existing).data, status=status.HTTP_200_OK)

        context = _fetch_context_from_provider(connector, ticket_id)
        ticket = IssueSupportTicket.objects.create(
            issue=issue,
            project_id=project_id,
            connector=connector,
            external_ticket_id=str(ticket_id),
            external_ticket_url=url,
            requester_email=context.get("requester_email"),
            requester_name=context.get("requester_name"),
            subject=(context.get("subject") or "")[:500],
            priority=(context.get("priority") or "")[:50],
            tags=context.get("tags") or [],
            last_synced_status=(context.get("status") or "")[:100],
            sync_state=SupportTicketSyncState.SYNCED if context else SupportTicketSyncState.PENDING,
            last_synced_at=timezone.now() if context else None,
        )

        IssueActivity.objects.create(
            issue_id=issue.id,
            project_id=project_id,
            workspace_id=issue.workspace_id,
            actor_id=request.user.id,
            verb="support_ticket_linked",
            field="support_ticket",
            new_value=str(ticket_id),
            comment=f"Linked {connector.provider} ticket #{ticket_id}",
        )
        return Response(IssueSupportTicketSerializer(ticket).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, issue_id, pk):
        """Exigence 16 - Member+ can unlink; never deletes the ticket
        provider-side nor the already-synced conversation history."""
        ticket = self.get_queryset().filter(pk=pk).first()
        if ticket is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        IssueActivity.objects.create(
            issue_id=issue_id,
            project_id=project_id,
            workspace_id=ticket.workspace_id,
            actor_id=request.user.id,
            verb="support_ticket_unlinked",
            field="support_ticket",
            old_value=ticket.external_ticket_id,
            comment=f"Unlinked {ticket.connector.provider} ticket #{ticket.external_ticket_id}",
        )
        ticket.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def refresh(self, request, slug, project_id, issue_id, pk):
        """Exigence 18 - manual resync, rate-limited to 1/30s/link."""
        ticket = self.get_queryset().filter(pk=pk).first()
        if ticket is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if ticket.last_manual_refresh_at and (
            timezone.now() - ticket.last_manual_refresh_at
        ).total_seconds() < MANUAL_REFRESH_MIN_INTERVAL_SECONDS:
            return Response(
                {"error": "Please wait before refreshing this link again"}, status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        context = _fetch_context_from_provider(ticket.connector, ticket.external_ticket_id)
        if not context:
            ticket.last_manual_refresh_at = timezone.now()
            ticket.save(update_fields=["last_manual_refresh_at"])
            return Response({"error": "Could not refresh from provider"}, status=status.HTTP_502_BAD_GATEWAY)

        if context.get("subject"):
            ticket.subject = context["subject"][:500]
        if context.get("status") is not None:
            ticket.last_synced_status = (context["status"] or "")[:100]
        if context.get("priority") is not None:
            ticket.priority = (context["priority"] or "")[:50]
        if context.get("tags") is not None:
            ticket.tags = context["tags"]
        if context.get("requester_email") is not None:
            ticket.requester_email = context["requester_email"]
        if context.get("requester_name") is not None:
            ticket.requester_name = context["requester_name"]
        ticket.sync_state = SupportTicketSyncState.SYNCED
        ticket.last_synced_at = timezone.now()
        ticket.last_manual_refresh_at = timezone.now()
        ticket.save()
        return Response(IssueSupportTicketSerializer(ticket).data, status=status.HTTP_200_OK)
