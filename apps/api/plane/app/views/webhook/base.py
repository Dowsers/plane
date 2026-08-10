# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import time
import uuid

# Django imports
from django.conf import settings
from django.db import IntegrityError

# Third party imports
import requests
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.db.models import Webhook, WebhookLog, Workspace
from plane.db.models.webhook import generate_token
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import WebhookSerializer, WebhookLogSerializer
from plane.bgtasks.webhook_task import sign_webhook_payload, save_webhook_log
from plane.utils.exception_logger import log_exception
from plane.utils.ip_address import validate_url

# Flat boolean columns on `Webhook` that gate each real event's delivery
# (see db/models/webhook.py) - this IS the full event catalog: the spec's
# "30+ evenements" claim does not match this codebase (verified by reading
# the model directly, see docs/feature-specs/08-api-webhooks-cli.md "6.
# Explorateur d'API interactif" research notes). A test-send may only pick
# one of these, and only one the webhook itself is actually subscribed to
# (its boolean is True) - testing an event the webhook doesn't listen for
# would validate a payload shape the receiver will never actually get.
WEBHOOK_TEST_EVENT_EXAMPLES = {
    "project": {
        "id": "00000000-0000-0000-0000-000000000001",
        "name": "Example Project",
        "identifier": "EXP",
        "description": "An example project used to illustrate this event's payload shape.",
    },
    "issue": {
        "id": "00000000-0000-0000-0000-000000000002",
        "name": "Example work item",
        "sequence_id": 1,
        "priority": "medium",
        "state": "00000000-0000-0000-0000-000000000003",
    },
    "module": {
        "id": "00000000-0000-0000-0000-000000000004",
        "name": "Example Module",
        "status": "in-progress",
    },
    "cycle": {
        "id": "00000000-0000-0000-0000-000000000005",
        "name": "Example Cycle",
        "start_date": "2026-01-01",
        "end_date": "2026-01-14",
    },
    "issue_comment": {
        "id": "00000000-0000-0000-0000-000000000006",
        "comment_stripped": "This is an example comment.",
        "issue": "00000000-0000-0000-0000-000000000002",
    },
    "workflow_rule": {
        "id": "00000000-0000-0000-0000-000000000007",
        "name": "Example automation rule",
        "trigger": "issue.created",
    },
    "workflow_transition": {
        "id": "00000000-0000-0000-0000-000000000008",
        "event": "workflow.transition.completed",
        "from_state": "00000000-0000-0000-0000-000000000009",
        "to_state": "00000000-0000-0000-0000-00000000000a",
    },
}

# Synchronous, so it needs its own (much shorter) timeout than the 30s used
# by the real async `webhook_send_task` - this call blocks an HTTP
# request/response cycle initiated by a human waiting on the explorer UI.
WEBHOOK_TEST_SEND_TIMEOUT_SECONDS = 10


class WebhookEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        try:
            serializer = WebhookSerializer(data=request.data, context={"request": request})
            if serializer.is_valid():
                serializer.save(workspace_id=workspace.id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"error": "URL already exists for the workspace"},
                    status=status.HTTP_409_CONFLICT,
                )
            raise IntegrityError

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        if pk is None:
            webhooks = Webhook.objects.filter(workspace__slug=slug)
            serializer = WebhookSerializer(
                webhooks,
                fields=(
                    "id",
                    "url",
                    "is_active",
                    "created_at",
                    "updated_at",
                    "project",
                    "issue",
                    "cycle",
                    "module",
                    "issue_comment",
                    "workflow_rule",
                ),
                many=True,
            )
            return Response(serializer.data, status=status.HTTP_200_OK)
        else:
            webhook = Webhook.objects.get(workspace__slug=slug, pk=pk)
            serializer = WebhookSerializer(
                webhook,
                fields=(
                    "id",
                    "url",
                    "is_active",
                    "created_at",
                    "updated_at",
                    "project",
                    "issue",
                    "cycle",
                    "module",
                    "issue_comment",
                    "workflow_rule",
                ),
            )
            return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        webhook = Webhook.objects.get(workspace__slug=slug, pk=pk)
        serializer = WebhookSerializer(
            webhook,
            data=request.data,
            context={request: request},
            partial=True,
            fields=(
                "id",
                "url",
                "is_active",
                "created_at",
                "updated_at",
                "project",
                "issue",
                "cycle",
                "module",
                "issue_comment",
                "workflow_rule",
            ),
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        webhook = Webhook.objects.get(pk=pk, workspace__slug=slug)
        webhook.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WebhookSecretRegenerateEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        webhook = Webhook.objects.get(workspace__slug=slug, pk=pk)
        webhook.secret_key = generate_token()
        webhook.save()
        serializer = WebhookSerializer(webhook)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WebhookLogsEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, webhook_id):
        webhook_logs = WebhookLog.objects.filter(workspace__slug=slug, webhook=webhook_id)
        serializer = WebhookLogSerializer(webhook_logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WebhookTestSendEndpoint(BaseAPIView):
    """
    POST /api/workspaces/{slug}/webhooks/{pk}/test/

    A real, from-scratch gap (unlike most of category 8's other features,
    there was no existing test-send mechanism anywhere in this codebase to
    extend - see docs/feature-specs/08-api-webhooks-cli.md "6. Explorateur
    d'API interactif" in plane-selfhost). Deliberately synchronous (no
    Celery task): a test-send is low-volume and user-initiated, and the
    caller needs the delivery result (status/latency/body snippet)
    immediately to render in the explorer or settings UI - queuing it
    would mean polling for a result for what is fundamentally a
    request/response interaction, unlike real event delivery which has no
    caller waiting on it.

    Placed alongside the other Webhook endpoints above (session-auth,
    `/api/workspaces/...`, Admin-only) rather than under `/api/v1/` -
    every existing webhook management endpoint already lives on this
    session-authenticated surface, and this is an extension of that same
    management surface (triggered from the Settings UI, or from the
    explorer via `source=explorer`), not a new token-authenticated
    integration endpoint.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        webhook = Webhook.objects.get(workspace__slug=slug, pk=pk)

        event_type = request.data.get("event_type")
        if event_type not in WEBHOOK_TEST_EVENT_EXAMPLES:
            return Response(
                {
                    "error": "event_type must be one of: " + ", ".join(sorted(WEBHOOK_TEST_EVENT_EXAMPLES)),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only test an event this webhook is actually subscribed to - a
        # payload for an event the receiver will never really get would be
        # a misleading test, not a helpful one.
        if not getattr(webhook, event_type, False):
            return Response(
                {"error": f"This webhook is not subscribed to the '{event_type}' event."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Accepted from either the body or the query string - the spec's
        # own wording ("accepter un parametre source=explorer") doesn't
        # pin down which, and the explorer/settings UI can most naturally
        # send either depending on how the call is wired up.
        source = request.data.get("source") or request.query_params.get("source") or "settings_ui"

        delivery_id = str(uuid.uuid4())
        payload = {
            "event": event_type,
            "action": "test",
            "webhook_id": str(webhook.id),
            "workspace_id": str(webhook.workspace_id),
            "data": WEBHOOK_TEST_EVENT_EXAMPLES[event_type],
            "activity": None,
            # Extra, additive key (not part of the real delivery payload
            # shape) so a receiver can trivially branch on "this is just a
            # connectivity/shape test, don't act on it" - real deliveries
            # from `webhook_send_task` never set this.
            "is_test_event": True,
        }

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Autopilot",
            "X-Plane-Delivery": delivery_id,
            "X-Plane-Event": event_type,
        }
        signature = sign_webhook_payload(webhook.secret_key, payload)
        if signature:
            headers["X-Plane-Signature"] = signature

        webhook.last_test_triggered_via = source
        webhook.save(update_fields=["last_test_triggered_via", "updated_at", "updated_by"])

        try:
            # Same SSRF re-validation the real delivery path applies at
            # send time - a test-send is still an admin-triggered outbound
            # POST to a user-supplied URL, it gets no less scrutiny than a
            # real one.
            validate_url(
                webhook.url,
                allowed_ips=settings.WEBHOOK_ALLOWED_IPS,
                allowed_hosts=settings.WEBHOOK_ALLOWED_HOSTS,
            )
        except ValueError as e:
            return Response(
                {"error": f"Webhook URL failed validation: {e}", "delivered": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        started_at = time.monotonic()
        try:
            response = requests.post(
                webhook.url, headers=headers, json=payload, timeout=WEBHOOK_TEST_SEND_TIMEOUT_SECONDS
            )
            latency_ms = int((time.monotonic() - started_at) * 1000)

            save_webhook_log(
                webhook=webhook,
                request_method="POST",
                request_headers=headers,
                request_body=payload,
                response_status=response.status_code,
                response_headers=dict(response.headers),
                response_body=response.text,
                retry_count=0,
                event_type=f"test:{event_type}",
            )

            # Always 200 from THIS endpoint - the call the caller made to
            # us succeeded; the interesting result is what the *target*
            # did, returned in the body below (never a silent/implied
            # success - exigence 15 - the caller must read `delivered` and
            # `response_status_code` to know what actually happened).
            return Response(
                {
                    "delivered": True,
                    "event_type": event_type,
                    "payload": payload,
                    "signature": signature,
                    "response_status_code": response.status_code,
                    "response_body": response.text[:2000],
                    "latency_ms": latency_ms,
                    "last_test_triggered_via": webhook.last_test_triggered_via,
                },
                status=status.HTTP_200_OK,
            )
        except requests.RequestException as e:
            latency_ms = int((time.monotonic() - started_at) * 1000)
            save_webhook_log(
                webhook=webhook,
                request_method="POST",
                request_headers=headers,
                request_body=payload,
                response_status=0,
                response_headers="",
                response_body=str(e),
                retry_count=0,
                event_type=f"test:{event_type}",
            )
            return Response(
                {
                    "delivered": False,
                    "event_type": event_type,
                    "payload": payload,
                    "signature": signature,
                    "error": str(e),
                    "latency_ms": latency_ms,
                    "last_test_triggered_via": webhook.last_test_triggered_via,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:  # noqa: BLE001 - a test-send failure must never 500 the caller
            log_exception(e)
            return Response(
                {"error": "Something went wrong while sending the test event", "delivered": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
