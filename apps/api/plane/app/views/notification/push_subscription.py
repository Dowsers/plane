# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 3 - "Notifications push en self-hosted", user-
facing subscription endpoints:

- `POST/GET /api/users/me/push-subscriptions/`
- `DELETE /api/users/me/push-subscriptions/<uuid:pk>/`

Body shape for `POST` matches the spec's own wording exactly:
`{"device_type": "WEB", "endpoint": "...", "keys": {"p256dh": "...",
"auth": "..."}}` for Web Push, or `{"device_type": "ANDROID"|"IOS",
"push_token": "..."}` for mobile (dead code path today - see
`plane.db.models.push_notification.PushNotificationSubscription`'s module
docstring; validated and stored all the same for forward-compatibility).

Re-`POST`ing the same `(user, endpoint)` (a browser calling
`pushManager.subscribe()` again, e.g. on every page load, is normal Push
API usage, not an error) is an idempotent UPSERT via
`update_or_create` - it refreshes `p256dh_key`/`auth_key`/`user_agent`
and flips `is_active` back to `True` rather than raising an
`IntegrityError` against this model's own partial unique constraint.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers import PushNotificationSubscriptionSerializer
from plane.db.models import PushNotificationSubscription

from ..base import BaseAPIView

_MAX_USER_AGENT_LENGTH = 512


class PushNotificationSubscriptionEndpoint(BaseAPIView):
    def get(self, request):
        subscriptions = PushNotificationSubscription.objects.filter(user=request.user, is_active=True).order_by(
            "-created_at"
        )
        serializer = PushNotificationSubscriptionSerializer(subscriptions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        device_type = request.data.get("device_type")
        if device_type not in PushNotificationSubscription.DeviceType.values:
            return Response(
                {"error": "A valid device_type (WEB, ANDROID, IOS) is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_agent = (request.META.get("HTTP_USER_AGENT") or "")[:_MAX_USER_AGENT_LENGTH]

        if device_type == PushNotificationSubscription.DeviceType.WEB:
            endpoint = request.data.get("endpoint")
            keys = request.data.get("keys") or {}
            p256dh_key = keys.get("p256dh")
            auth_key = keys.get("auth")
            if not endpoint or not p256dh_key or not auth_key:
                return Response(
                    {"error": "endpoint and keys.p256dh/keys.auth are required for a WEB subscription."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            subscription, _ = PushNotificationSubscription.objects.update_or_create(
                user=request.user,
                endpoint=endpoint,
                defaults={
                    "device_type": device_type,
                    "p256dh_key": p256dh_key,
                    "auth_key": auth_key,
                    "push_token": None,
                    "user_agent": user_agent,
                    "is_active": True,
                },
            )
        else:
            push_token = request.data.get("push_token")
            if not push_token:
                return Response(
                    {"error": "push_token is required for an ANDROID/IOS subscription."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            subscription, _ = PushNotificationSubscription.objects.update_or_create(
                user=request.user,
                push_token=push_token,
                defaults={
                    "device_type": device_type,
                    "endpoint": None,
                    "p256dh_key": None,
                    "auth_key": None,
                    "user_agent": user_agent,
                    "is_active": True,
                },
            )

        serializer = PushNotificationSubscriptionSerializer(subscription)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PushNotificationSubscriptionDetailEndpoint(BaseAPIView):
    def delete(self, request, pk):
        subscription = PushNotificationSubscription.objects.filter(user=request.user, pk=pk).first()
        if subscription is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        # Soft delete - same `BaseModel`/`SoftDeleteModel`-wide convention
        # every other model in this fork already uses for `.delete()`
        # (see `plane.db.mixins.SoftDeleteModel`); the model's own partial
        # unique constraints (`deleted_at__isnull=True`) let a later
        # re-subscribe with the same endpoint/token create a fresh row
        # without colliding against this one's history.
        subscription.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
