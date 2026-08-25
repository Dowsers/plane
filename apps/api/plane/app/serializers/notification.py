# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from .user import UserLiteSerializer
from plane.db.models import Notification, UserNotificationPreference

# Third Party imports
from rest_framework import serializers


class NotificationSerializer(BaseSerializer):
    triggered_by_details = UserLiteSerializer(read_only=True, source="triggered_by")
    is_inbox_issue = serializers.BooleanField(read_only=True)
    is_intake_issue = serializers.BooleanField(read_only=True)
    is_mentioned_notification = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = "__all__"


class UserNotificationPreferenceSerializer(BaseSerializer):
    class Meta:
        model = UserNotificationPreference
        fields = "__all__"

    def validate(self, attrs):
        # Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
        # plane-selfhost), feature 3, exigence 2/4 - a quiet-hours WINDOW
        # only makes sense with both a start and an end; guard against a
        # partial PATCH leaving `quiet_hours_enabled=True` with one (or
        # both) of `quiet_hours_start`/`quiet_hours_end` still `None` -
        # `plane.bgtasks.push_notification_task._is_within_quiet_hours`
        # already treats that combination defensively (never suppresses
        # push on missing bounds), but rejecting it here gives the caller
        # an immediate, actionable 400 instead of a silently-inert toggle.
        quiet_hours_enabled = attrs.get(
            "quiet_hours_enabled",
            getattr(self.instance, "quiet_hours_enabled", False),
        )
        if quiet_hours_enabled:
            start = attrs.get("quiet_hours_start", getattr(self.instance, "quiet_hours_start", None))
            end = attrs.get("quiet_hours_end", getattr(self.instance, "quiet_hours_end", None))
            if start is None or end is None:
                raise serializers.ValidationError(
                    "quiet_hours_start and quiet_hours_end are both required when quiet_hours_enabled is true."
                )
        return attrs
