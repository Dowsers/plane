# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Sentry integration serializers - see
docs/feature-specs/07-integrations-git.md ("5. Integration Sentry
native") in plane-selfhost.
"""

from rest_framework import serializers

from plane.db.models import IntegrationEventLog, IssueSentryDetail, SentryProjectSync, WorkspaceSentryConnection

from .base import BaseSerializer


class WorkspaceSentryConnectionSerializer(BaseSerializer):
    """Exigence 10 - "le token Sentry est... jamais restitué en clair par
    l'API après création (uniquement sous forme masquée)"."""

    masked_token = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceSentryConnection
        fields = [
            "id",
            "workspace",
            "org_slug",
            "base_url",
            "masked_token",
            "is_active",
            "connected_by",
            "connected_at",
            "last_validated_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_masked_token(self, obj):
        return f"sntrys_****{obj.token_last_4}" if obj.token_last_4 else "****"


class SentryProjectSyncSerializer(BaseSerializer):
    class Meta:
        model = SentryProjectSync
        fields = [
            "id",
            "workspace",
            "project",
            "connection",
            "sentry_project_slug",
            "default_state",
            "resolved_state",
            "reopen_state",
            "label",
            "auto_resolve",
            "auto_reopen",
            "sync_comments_on_new_events",
            "comment_throttle_minutes",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "workspace", "project", "created_at", "updated_at", "created_by"]


class IssueSentryDetailSerializer(BaseSerializer):
    """Consumed by `IssueDetailSerializer`'s optional `sentry_issue` block
    (Considerations API/UX) - "Sérialiseur Issue enrichi d'un bloc
    optionnel sentry_issue"."""

    class Meta:
        model = IssueSentryDetail
        fields = [
            "id",
            "sentry_issue_id",
            "sentry_short_id",
            "permalink",
            "level",
            "status",
            "event_count",
            "last_seen_at",
            "last_synced_at",
            "last_outbound_sync_status",
            "is_sync_active",
        ]
        read_only_fields = fields


class IntegrationEventLogSerializer(BaseSerializer):
    class Meta:
        model = IntegrationEventLog
        fields = [
            "id",
            "workspace",
            "provider",
            "connector_id",
            "direction",
            "event_type",
            "external_event_id",
            "payload",
            "response_status",
            "error_message",
            "created_at",
        ]
        read_only_fields = fields
