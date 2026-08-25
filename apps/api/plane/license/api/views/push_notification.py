# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 3 - "Notifications push en self-hosted", god-mode
(Instance Admin) admin endpoints, namespaced under
`/api/instances/configurations/push/...` per the spec's own "Endpoints
admin instance" section.

`PushNotificationConfigEndpoint` (`GET`/`PATCH ../push/`) - see
`plane.license.models.push_notification.PushNotificationConfig`'s module
docstring for the full storage-decision rationale. Writes go directly
against `request.data` (never through the serializer, which lists every
field as read-only), exactly mirroring
`plane.app.views.workspace_ai_config.WorkspaceAIConfigEndpoint.patch`'s
established convention for `WorkspaceAIConfig.api_key`.

`GenerateVapidKeysEndpoint` (`POST ../push/generate-vapid-keys/`,
exigence 9) - generates a fresh VAPID keypair server-side, stores the
private half on `PushNotificationConfig` (encrypted) and the public half
on `InstanceConfiguration.VAPID_PUBLIC_KEY` (plain - not a secret), and
returns only the public key. Overwrites any previously configured VAPID
keys - every already-subscribed browser's `PushSubscription` was created
against the OLD public key, so rotating keys silently breaks push for
every existing subscription until each one re-subscribes; this endpoint
does not attempt any "flag existing subscriptions as stale" mechanism
(out of scope - a UI-level confirmation before calling this is a frontend
concern, not this endpoint's).

`PushNotificationTestEndpoint` (`POST ../push/test/`, exigence 9 wording:
"Envoyer un test") - sends a REAL test push, synchronously (not via
`.delay()`), to the calling admin's own active `PushNotificationSubscription`s,
so the admin gets the actual `pywebpush` result back in the response body
immediately. Synchronous-send-for-immediate-feedback is a deliberate
choice here, not an oversight of requirement 11's "never blocks the HTTP
request" rule - that rule is about requests that TRIGGER a real event
(commenting, mentioning, etc.), where the requester has no reason to wait
on push delivery. A "test" button's entire purpose is the opposite: the
admin explicitly wants to wait and see whether it worked. Same reasoning
`EmailCredentialCheckEndpoint` (`plane.license.api.views.configuration`)
already applies to its own synchronous SMTP test-send.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.bgtasks.push_notification_task import send_web_push_to_subscription
from plane.db.models import AuditEventType, PushNotificationSubscription
from plane.license.api.permissions import InstanceAdminPermission
from plane.license.api.serializers import PushNotificationConfigSerializer
from plane.license.models import InstanceConfiguration, PushNotificationConfig
from plane.utils.audit_log import log_audit_event
from plane.utils.cache import invalidate_cache
from plane.utils.vapid import build_vapid_from_private_key, generate_vapid_keypair

from .base import BaseAPIView

# Genuinely secret - never listed on `PushNotificationConfigSerializer`,
# written directly from `request.data` here, and only ever actually
# overwritten when the key is PRESENT in the request payload (so a
# partial PATCH that only sends e.g. `vapid_admin_email` never
# accidentally blanks out an already-configured secret).
_SECRET_FIELDS = ["vapid_private_key", "fcm_service_account_json", "apns_auth_key"]

# Non-secret, still admin-only (not exposed to any non-admin caller).
_PLAIN_FIELDS = ["vapid_admin_email", "apns_key_id", "apns_team_id", "apns_topic"]


class PushNotificationConfigEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    def get(self, request):
        config = PushNotificationConfig.get_solo()
        return Response(PushNotificationConfigSerializer(config).data, status=status.HTTP_200_OK)

    def patch(self, request):
        config = PushNotificationConfig.get_solo()

        touched = []
        for field in _PLAIN_FIELDS + _SECRET_FIELDS:
            if field in request.data:
                setattr(config, field, request.data.get(field) or None)
                touched.append(field)
        config.save()

        secrets_touched = [field for field in touched if field in _SECRET_FIELDS]
        if secrets_touched:
            # Exigence 8 - never logs the actual secret values, only which
            # keys changed. Same instance-scoped (`workspace=None`)
            # convention as `OAUTH_CONFIG_UPDATED`.
            log_audit_event(
                AuditEventType.PUSH_CONFIG_UPDATED,
                request=request,
                workspace=None,
                actor=request.user,
                metadata={"keys_updated": secrets_touched},
            )

        return Response(PushNotificationConfigSerializer(config).data, status=status.HTTP_200_OK)


class GenerateVapidKeysEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    @invalidate_cache(path="/api/instances/configurations/", user=False)
    @invalidate_cache(path="/api/instances/", user=False)
    def post(self, request):
        public_key_b64, private_key_b64 = generate_vapid_keypair()

        config = PushNotificationConfig.get_solo()
        config.vapid_private_key = private_key_b64
        config.save()

        # Public key is not a secret - lives on `InstanceConfiguration`
        # alongside the kill switch (see that model's own seed data in
        # `plane.utils.instance_config_variables.extended`), so the
        # public `GET /api/instances/` can surface it to any browser
        # deciding whether/how to subscribe.
        InstanceConfiguration.objects.filter(key="VAPID_PUBLIC_KEY").update(value=public_key_b64)

        log_audit_event(
            AuditEventType.PUSH_CONFIG_UPDATED,
            request=request,
            workspace=None,
            actor=request.user,
            metadata={"keys_updated": ["vapid_private_key", "VAPID_PUBLIC_KEY"], "action": "generated"},
        )

        return Response({"vapid_public_key": public_key_b64}, status=status.HTTP_200_OK)


class PushNotificationTestEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    def post(self, request):
        config = PushNotificationConfig.get_solo()
        vapid = build_vapid_from_private_key(config.vapid_private_key)
        if vapid is None:
            return Response(
                {"error": "No VAPID private key is configured - generate or enter one first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subscriptions = list(
            PushNotificationSubscription.objects.filter(
                user=request.user,
                is_active=True,
                device_type=PushNotificationSubscription.DeviceType.WEB,
            )
        )
        if not subscriptions:
            return Response(
                {"error": "You have no active Web Push subscriptions to send a test to."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        for subscription in subscriptions:
            success = send_web_push_to_subscription(
                subscription,
                title="Plane push test",
                body="If you can see this, push notifications are configured correctly.",
                url="/",
                config=config,
                vapid=vapid,
            )
            results.append({"subscription_id": str(subscription.id), "success": success})

        overall_success = any(result["success"] for result in results)
        return Response(
            {"success": overall_success, "results": results},
            status=status.HTTP_200_OK if overall_success else status.HTTP_400_BAD_REQUEST,
        )
