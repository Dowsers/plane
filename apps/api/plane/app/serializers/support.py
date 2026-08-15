# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Support-connector serializers - see
docs/feature-specs/07-integrations-git.md ("6. Pont support client type
Zendesk/Front") in plane-selfhost.
"""

from rest_framework import serializers

from plane.db.models import IssueSupportTicket, WorkspaceSupportConnector

from .base import BaseSerializer


class WorkspaceSupportConnectorSerializer(BaseSerializer):
    """Exigence 3 - "ne sont jamais renvoyés en clair par l'API après
    création - seule leur empreinte partielle (4 derniers caractères) est
    affichée dans l'UI"."""

    masked_api_token = serializers.SerializerMethodField()
    masked_webhook_secret = serializers.SerializerMethodField()
    inbound_webhook_path = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceSupportConnector
        fields = [
            "id",
            "workspace",
            "provider",
            "name",
            "domain",
            "masked_api_token",
            "masked_webhook_secret",
            "inbound_webhook_path",
            "default_project",
            "default_state",
            "reopen_ticket_on_resolve",
            "reopen_note_visibility",
            "is_enabled",
            "generic_field_mapping",
            "connected_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "masked_api_token",
            "masked_webhook_secret",
            "inbound_webhook_path",
            "connected_by",
            "created_at",
            "updated_at",
        ]

    def get_masked_api_token(self, obj):
        return f"****{obj.token_last_4}" if obj.token_last_4 else None

    def get_masked_webhook_secret(self, obj):
        return "********" if obj.webhook_secret else None

    def get_inbound_webhook_path(self, obj):
        return f"/api/public/support-webhooks/{obj.id}/{obj.inbound_token}/"


class IssueSupportTicketSerializer(BaseSerializer):
    provider = serializers.CharField(source="connector.provider", read_only=True)

    class Meta:
        model = IssueSupportTicket
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "connector",
            "provider",
            "external_ticket_id",
            "external_ticket_url",
            "requester_email",
            "requester_name",
            "subject",
            "priority",
            "tags",
            "last_synced_status",
            "last_message_snippet",
            "sync_state",
            "last_sync_error",
            "last_synced_at",
            "last_manual_refresh_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "last_synced_status",
            "last_message_snippet",
            "sync_state",
            "last_sync_error",
            "last_synced_at",
            "last_manual_refresh_at",
            "created_at",
        ]
