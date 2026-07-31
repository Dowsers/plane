# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.db.models import InboundEmailAlias, IntakeMessageLog, SlackWorkspaceConnection
from plane.utils.slack_signature import verify_slack_signature

NOT_IMPLEMENTED_MESSAGE = (
    "This is a skeleton endpoint (docs/feature-specs/02-cycles-intake.md, "
    "'Intake omnicanal'). Channel resolution and signature verification are "
    "real; parsing the payload into an issue is not implemented in this "
    "iteration - see docker/api/omnichannel-intake-skeleton/README.md."
)


class EmailInboundWebhookEndpoint(BaseAPIView):
    """
    Receives inbound-parse webhooks from a provider (SES/Postmark/Mailgun -
    the spec leaves the provider choice open, see the README's open
    questions). Routes to a project via the "to" address; does not parse
    the email body into an issue yet.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        to_address = str(request.data.get("to") or request.data.get("To") or "").strip().lower()
        local_part = to_address.split("@")[0] if "@" in to_address else to_address

        alias = InboundEmailAlias.objects.filter(local_part=local_part, is_active=True).select_related(
            "intake_channel"
        ).first()
        if alias is None or not alias.intake_channel.is_enabled:
            # Generic response - no confirmation of which aliases exist.
            return Response({"error": "Unknown recipient"}, status=status.HTTP_404_NOT_FOUND)

        IntakeMessageLog.objects.create(
            project_id=alias.project_id,
            workspace_id=alias.workspace_id,
            direction="INBOUND",
            channel_type="EMAIL",
            external_message_id=str(request.data.get("Message-Id") or request.data.get("message_id") or ""),
            raw_payload=request.data if isinstance(request.data, dict) else json.loads(request.body or "{}"),
        )

        return Response({"error": NOT_IMPLEMENTED_MESSAGE}, status=status.HTTP_501_NOT_IMPLEMENTED)


class SlackEventsWebhookEndpoint(BaseAPIView):
    """
    Slack Events API receiver. Implements the URL verification handshake
    and real signature verification (both fully testable without a live
    Slack app) but not the actual message/app_mention handling.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        body = request.body.decode("utf-8") if isinstance(request.body, bytes) else str(request.body)
        payload = request.data if isinstance(request.data, dict) else json.loads(body or "{}")

        # Slack's one-time URL verification challenge - required before
        # Slack will start sending real events, and independently testable.
        if payload.get("type") == "url_verification":
            return Response({"challenge": payload.get("challenge")}, status=status.HTTP_200_OK)

        team_id = payload.get("team_id")
        connection = SlackWorkspaceConnection.objects.filter(slack_team_id=team_id, is_active=True).first()
        if connection is None:
            return Response({"error": "Unknown Slack team"}, status=status.HTTP_404_NOT_FOUND)

        signature_valid = verify_slack_signature(
            connection.signing_secret,
            request.headers.get("X-Slack-Request-Timestamp"),
            body,
            request.headers.get("X-Slack-Signature"),
        )
        if not signature_valid:
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        IntakeMessageLog.objects.create(
            workspace_id=connection.workspace_id,
            direction="INBOUND",
            channel_type="SLACK",
            external_message_id=str(payload.get("event", {}).get("ts", "")),
            raw_payload=payload,
        )

        return Response({"error": NOT_IMPLEMENTED_MESSAGE}, status=status.HTTP_501_NOT_IMPLEMENTED)


class SlackInteractiveWebhookEndpoint(BaseAPIView):
    """
    Slack interactive components (message shortcuts, modal submissions,
    DM project-selection menus). Signature verification is real; the
    actual interaction handling is not implemented.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        body = request.body.decode("utf-8") if isinstance(request.body, bytes) else str(request.body)
        payload_raw = request.data.get("payload") if hasattr(request, "data") else None
        payload = json.loads(payload_raw) if payload_raw else {}

        team_id = (payload.get("team") or {}).get("id")
        connection = SlackWorkspaceConnection.objects.filter(slack_team_id=team_id, is_active=True).first()
        if connection is None:
            return Response({"error": "Unknown Slack team"}, status=status.HTTP_404_NOT_FOUND)

        signature_valid = verify_slack_signature(
            connection.signing_secret,
            request.headers.get("X-Slack-Request-Timestamp"),
            body,
            request.headers.get("X-Slack-Signature"),
        )
        if not signature_valid:
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        return Response({"error": NOT_IMPLEMENTED_MESSAGE}, status=status.HTTP_501_NOT_IMPLEMENTED)
