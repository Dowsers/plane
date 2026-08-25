# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 3 - "Notifications push en self-hosted", backend
half.

`PushNotificationSubscription` in its own module (not appended to
`plane.db.models.notification`) - that file already holds `Notification`/
`UserNotificationPreference`/`EmailNotificationLog`, and this is a wholly
new model, not an extension of an existing one, matching this fork's own
precedent of splitting a genuinely new model into its own file even when
conceptually adjacent (`plane.db.models.ai_config`, `plane.db.models.
rate_limit`, `plane.license.models.saml`, `plane.license.models.scim` all
did the same rather than growing an existing file indefinitely).
`UserNotificationPreference` itself IS extended in place (see
`notification.py`) - it's the same row-per-user model the email
preferences already live on, not a new model, so extending it in place
matches how category 10's `page_edits`/`page_mentions`/`page_comments`
fields were added to that exact same model.

RESEARCH GROUNDING (pre-implementation, trusted over the spec's own
plane-selfhost text where they disagree):
- `plane.db.models.device.Device`/`DeviceSession` already exist with a
  `push_token`/`DeviceType` (including `DESKTOP`) but are 100% dormant -
  zero views/serializers/URLs reference them anywhere in this fork.
  Explicit decision (not this feature's call to make silently): build
  this fresh model instead of repurposing `Device` - Web Push genuinely
  needs 3 separate keys (`endpoint`/`p256dh`/`auth`) that `Device`'s
  single flat `push_token` field doesn't fit, and touching a dormant
  model not exercised by anything risks unrelated regressions for no
  benefit. `Device`/`DeviceSession` are untouched by this feature.
- Categories 12 features 1/2/5 (mobile/desktop app "unblock") were
  confirmed as total fabrication (no mobile/desktop app code exists
  anywhere in this repo or its git history) and skipped. `ANDROID`/`IOS`
  are therefore schema-complete-but-currently-unreachable `device_type`
  choices, kept only for forward-compatibility per explicit instruction -
  no real client can ever create one today. `WEB` is the only choice any
  real request can use right now.
"""

from django.conf import settings
from django.db import models

from .base import BaseModel


class PushNotificationSubscription(BaseModel):
    class DeviceType(models.TextChoices):
        WEB = "WEB", "Web"
        ANDROID = "ANDROID", "Android"
        IOS = "IOS", "iOS"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    device_type = models.CharField(max_length=10, choices=DeviceType.choices)

    # Web Push (device_type == WEB) - the standard `PushSubscription`
    # shape a browser's `pushManager.subscribe()` promise resolves to.
    # All three nullable together: a mobile subscription (ANDROID/IOS)
    # never populates any of them, only `push_token` below.
    endpoint = models.URLField(max_length=1000, null=True, blank=True)
    p256dh_key = models.CharField(max_length=255, null=True, blank=True)
    auth_key = models.CharField(max_length=255, null=True, blank=True)

    # Mobile push (device_type in {ANDROID, IOS}) - FCM registration token
    # or APNs device token. Dead code path for now given features 1/2/5
    # were dropped as fabricated (see module docstring) - kept per spec so
    # the schema doesn't need a second migration if a real mobile client
    # ever shows up in a future category.
    push_token = models.CharField(max_length=500, null=True, blank=True)

    user_agent = models.CharField(max_length=512, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Push Notification Subscription"
        verbose_name_plural = "Push Notification Subscriptions"
        db_table = "push_notification_subscriptions"
        ordering = ("-created_at",)
        constraints = [
            # Partial (not plain `unique=True`) because every row here is
            # a `BaseModel`/`SoftDeleteModel` - `.delete()` sets
            # `deleted_at` rather than removing the row (see
            # `plane.db.mixins.SoftDeleteModel`), so a revoked-then-
            # resubscribed endpoint/token must be able to collide with its
            # own soft-deleted history without an IntegrityError. Exact
            # same shape as `WorkspaceAIConfig`'s
            # `workspace_ai_config_unique_workspace_when_not_deleted`
            # constraint (`plane.db.models.ai_config`).
            models.UniqueConstraint(
                fields=["user", "endpoint"],
                condition=models.Q(deleted_at__isnull=True, endpoint__isnull=False),
                name="push_subscription_unique_user_endpoint_when_active",
            ),
            models.UniqueConstraint(
                fields=["user", "push_token"],
                condition=models.Q(deleted_at__isnull=True, push_token__isnull=False),
                name="push_subscription_unique_user_push_token_when_active",
            ),
        ]

    def __str__(self):
        return f"{self.user_id} <{self.device_type}>"
