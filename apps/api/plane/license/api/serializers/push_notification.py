# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 3 - god-mode admin serializer for
`PushNotificationConfig`.

`vapid_private_key`/`fcm_service_account_json`/`apns_auth_key` are
INTENTIONALLY never listed in `fields` - matching
`WorkspaceAIConfigSerializer`'s established write-only convention (see
`plane.license.models.push_notification`'s module docstring for the full
rationale) - only derived `is_*_configured` booleans expose whether each
secret is set. Writes to those three fields happen directly in
`plane.license.api.views.push_notification.PushNotificationConfigEndpoint.
patch`, via `request.data.get(...)`, never through this serializer -
again mirroring `WorkspaceAIConfig`'s view, which writes `api_key` the
same way.
"""

from rest_framework import serializers

from plane.license.models import PushNotificationConfig

from .base import BaseSerializer


class PushNotificationConfigSerializer(BaseSerializer):
    is_vapid_configured = serializers.SerializerMethodField()
    is_fcm_configured = serializers.SerializerMethodField()
    is_apns_configured = serializers.SerializerMethodField()

    class Meta:
        model = PushNotificationConfig
        fields = [
            "id",
            "vapid_admin_email",
            "apns_key_id",
            "apns_team_id",
            "apns_topic",
            "is_vapid_configured",
            "is_fcm_configured",
            "is_apns_configured",
            "created_at",
            "updated_at",
        ]
        # Every field here is either non-secret (safe to read, but still
        # only reachable by an instance admin - see the view's
        # `InstanceAdminPermission`) or a derived boolean - all writes,
        # secret or not, go through the view directly so the "which fields
        # were actually present in this PATCH" logic lives in one place
        # rather than being split between this serializer and the view.
        read_only_fields = fields

    def get_is_vapid_configured(self, obj):
        return bool(obj.vapid_private_key)

    def get_is_fcm_configured(self, obj):
        return bool(obj.fcm_service_account_json)

    def get_is_apns_configured(self, obj):
        return bool(obj.apns_auth_key)
