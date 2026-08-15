# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Public inbound Sentry webhook endpoint - see
docs/feature-specs/07-integrations-git.md ("5. Integration Sentry
native", exigence 11, "Considerations API / UX") in plane-selfhost.

Shape (`AllowAny` + signature verification before any processing, real
signature-verification precedent) directly imitates
`plane.space.views.intake_channel.SlackEventsWebhookEndpoint` - see that
file and `plane.utils.slack_signature` for the pattern this was modeled
on.
"""

import json

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .base import BaseAPIView
from plane.db.models import WorkspaceSentryConnection
from plane.utils.sentry_inbound import handle_event_alert, handle_issue_event
from plane.utils.sentry_signature import verify_sentry_signature


class SentryWebhookThrottle(SimpleRateThrottle):
    """Considerations API/UX - "rate-limité". Scoped per connection (not
    globally) so one noisy/misconfigured Sentry connection can't exhaust
    the shared rate budget of every other workspace's webhook."""

    scope = "sentry_webhook"
    rate = "120/min"

    def get_cache_key(self, request, view):
        connection_id = view.kwargs.get("connection_id")
        return self.cache_format % {"scope": self.scope, "ident": connection_id}


class SentryWebhookEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [SentryWebhookThrottle]

    def post(self, request, connection_id):
        body = request.body if isinstance(request.body, bytes) else str(request.body).encode("utf-8")

        # Exigence 11 - workspace-cross-tenant safety starts here: every
        # downstream lookup in sentry_inbound.py is scoped through this
        # specific `connection` row (its own workspace_id), never global.
        connection = WorkspaceSentryConnection.objects.filter(pk=connection_id, is_active=True).first()
        if connection is None:
            # Generic 404 - doesn't confirm/deny whether the UUID exists
            # for a *different* (inactive/other-workspace) connection.
            return Response({"error": "Unknown connection"}, status=status.HTTP_404_NOT_FOUND)

        signature = request.headers.get("Sentry-Hook-Signature")
        if not verify_sentry_signature(connection.webhook_secret, body, signature):
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            payload = json.loads(body or b"{}")
        except (TypeError, ValueError):
            return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        resource = request.headers.get("Sentry-Hook-Resource")
        action = payload.get("action")
        external_event_id = request.headers.get("Sentry-Hook-Delivery") or "{}:{}:{}".format(
            resource, action, (payload.get("data", {}).get("issue", {}) or {}).get("id")
        )

        if resource == "issue":
            result = handle_issue_event(connection, action, payload.get("data"), external_event_id)
        elif resource == "event_alert":
            result = handle_event_alert(connection, payload.get("data"), external_event_id)
        else:
            # "installation" (handshake) and anything else Sentry might
            # send - acknowledged, no processing needed.
            result = {"status": "ignored", "reason": f"unhandled resource '{resource}'"}

        return Response(result, status=status.HTTP_200_OK)
