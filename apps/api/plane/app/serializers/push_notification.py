# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 3 - user-facing serializer for
`PushNotificationSubscription` (the "Manage devices" list, exigence 12).

Output-only: `endpoint`/`p256dh_key`/`auth_key`/`push_token` are never
listed here - a "manage my devices" screen only needs to show which
devices exist (`device_type`/`user_agent`/`last_used_at`), not their raw
Web Push endpoint URL or cryptographic keys, and there is no reason to
round-trip `auth_key` (a real shared secret used to authenticate push
messages TO that browser) back out over the wire once stored. Creation
(`POST /api/users/me/push-subscriptions/`) is handled directly in
`plane.app.views.notification.push_subscription.
PushNotificationSubscriptionEndpoint.post` against `request.data`
(`device_type` + either `{endpoint, keys: {p256dh, auth}}` or
`{push_token}`, per the spec's own body shape) rather than through this
serializer, matching this fork's `WorkspaceAIConfigSerializer` convention
for "write shape doesn't match the read shape" fields.
"""

from .base import BaseSerializer
from plane.db.models import PushNotificationSubscription


class PushNotificationSubscriptionSerializer(BaseSerializer):
    class Meta:
        model = PushNotificationSubscription
        fields = ["id", "device_type", "user_agent", "is_active", "last_used_at", "created_at"]
        read_only_fields = fields
