# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Public inbound GitHub webhook endpoint - see
docs/feature-specs/07-integrations-git.md ("1. GitHub natif", exigence 7)
in plane-selfhost. Shape (`AllowAny` + signature verification before any
processing) imitates `plane.space.views.sentry_webhook.SentryWebhookEndpoint`
/ `plane.space.views.intake_channel.SlackEventsWebhookEndpoint`.

Resolution via `X-GitHub-Hook-ID` (not the repository id from the
payload) is deliberate and security-relevant: exigence 8 allows the SAME
GitHub repository to be synced to several Plane projects at once (a
monorepo), each with its OWN separately-registered webhook and its own
independent `webhook_secret` (see `GithubRepositoryProjectSync`). GitHub
sends this header on every delivery (confirmed in GitHub's own webhook
documentation) identifying exactly which registered hook fired - looking
the sync up by that id means the signature is always checked against the
one secret that hook was actually created with, rather than trying every
sync's secret for a matching repo (which would leak timing information
about which of several project syncs are configured) or trusting a
repository id taken from the unverified request body before any
signature check has even happened.
"""

import json

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .base import BaseAPIView
from plane.bgtasks.github_sync_task import process_github_webhook_event
from plane.db.models import GithubRepositoryProjectSync
from plane.utils.exception_logger import log_exception
from plane.utils.github_signature import verify_github_signature

_HANDLED_EVENTS = {"pull_request", "pull_request_review"}


class GithubWebhookThrottle(SimpleRateThrottle):
    scope = "github_webhook"
    rate = "120/min"

    def get_cache_key(self, request, view):
        hook_id = request.headers.get("X-GitHub-Hook-ID", "unknown")
        return self.cache_format % {"scope": self.scope, "ident": hook_id}


class GithubWebhookEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [GithubWebhookThrottle]

    def post(self, request):
        body = request.body if isinstance(request.body, bytes) else str(request.body).encode("utf-8")

        hook_id = request.headers.get("X-GitHub-Hook-ID")
        event_type = request.headers.get("X-GitHub-Event")
        signature = request.headers.get("X-Hub-Signature-256")

        if not hook_id:
            log_exception(Exception("github_webhook: missing X-GitHub-Hook-ID header"), warning=True)
            return Response({"error": "Missing X-GitHub-Hook-ID header"}, status=status.HTTP_400_BAD_REQUEST)

        repository_sync = GithubRepositoryProjectSync.objects.filter(
            webhook_external_id=str(hook_id), is_active=True
        ).first()
        if repository_sync is None:
            # Generic 404 - doesn't confirm/deny whether this hook id
            # exists for a different (inactive/deleted) sync.
            log_exception(Exception(f"github_webhook: unknown or inactive hook id {hook_id}"), warning=True)
            return Response({"error": "Unknown webhook"}, status=status.HTTP_404_NOT_FOUND)

        if not verify_github_signature(repository_sync.webhook_secret, body, signature):
            log_exception(
                Exception(f"github_webhook: invalid signature for repository_sync {repository_sync.id}"),
                warning=True,
            )
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            payload = json.loads(body or b"{}")
        except (TypeError, ValueError):
            return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        if event_type in _HANDLED_EVENTS:
            process_github_webhook_event.delay(
                repository_sync_id=str(repository_sync.id), event_type=event_type, payload=payload
            )

        # Every other event type (ping, ...) is acknowledged without
        # further processing - GitHub sends `ping` once on webhook
        # creation and expects a 2xx, not an error.
        return Response({"status": "accepted"}, status=status.HTTP_200_OK)
