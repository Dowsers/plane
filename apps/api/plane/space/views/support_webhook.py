# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Public inbound support-ticket webhook endpoint (Zendesk/Front/generic) -
see docs/feature-specs/07-integrations-git.md ("6. Pont support client
type Zendesk/Front", exigence 8, "Considerations API / UX") in
plane-selfhost.

URL shape matches the spec's own suggestion almost verbatim:
`POST /api/public/support-webhooks/<connector_id>/<inbound_token>/` -
`inbound_token` (an unguessable per-connector slug, exigence's own
"inbound_token") is checked *in addition to* the HMAC signature, not
instead of it - exigence 8 requires signature verification unconditionally
("obligatoire... toute requête à signature absente ou invalide est
rejetée en 401"), the token alone is defense in depth against URL leakage,
not a substitute.
"""

import json

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .base import BaseAPIView
from plane.db.models import WorkspaceSupportConnector
from plane.utils.support_inbound import process_inbound_ticket_event
from plane.utils.support_signature import verify_support_webhook_signature


class SupportWebhookThrottle(SimpleRateThrottle):
    scope = "support_webhook"
    rate = "120/min"

    def get_cache_key(self, request, view):
        connector_id = view.kwargs.get("connector_id")
        return self.cache_format % {"scope": self.scope, "ident": connector_id}


class SupportWebhookEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [SupportWebhookThrottle]

    def post(self, request, connector_id, inbound_token):
        body = request.body if isinstance(request.body, bytes) else str(request.body).encode("utf-8")

        # Exigence's own cross-tenant safety shape (same as Sentry's) -
        # every downstream lookup in support_inbound.py is scoped through
        # this specific `connector` row's own workspace_id.
        connector = WorkspaceSupportConnector.objects.filter(
            pk=connector_id, inbound_token=inbound_token, is_enabled=True
        ).first()
        if connector is None:
            return Response({"error": "Unknown connector"}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 8 - "obligatoire... rejetée en 401 et journalisée, sans
        # effet de bord" - the signature check happens before any payload
        # parsing/processing, matching the Sentry/Slack precedents.
        if not verify_support_webhook_signature(connector.provider, connector.webhook_secret, request.headers, body):
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            payload = json.loads(body or b"{}")
        except (TypeError, ValueError):
            return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        external_event_id = (
            request.headers.get("X-Zendesk-Webhook-Id")
            or request.headers.get("X-Front-Id")
            or request.headers.get("X-Webhook-Delivery-Id")
        )

        result = process_inbound_ticket_event(connector, payload, external_event_id)
        return Response(result, status=status.HTTP_200_OK)
