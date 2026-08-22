# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), features 3+5 merged - `WorkspaceAuditLog` serializers.
"""

from rest_framework import serializers

from .base import BaseSerializer, DynamicBaseSerializer
from .user import UserLiteSerializer
from plane.db.models import WorkspaceAuditLog

# List view fields (exigence 8's own "colonnes" wording) - deliberately
# excludes `old_value`/`new_value`/`metadata`/`user_agent`, reserved for
# the detail endpoint (exigence "détail d'une entrée (payload complet")
# and CSV export, so a long list response doesn't ship every entry's full
# JSON blob just to render a table.
#
# NOTE: this is a genuinely separate, hardcoded-`Meta.fields` serializer
# class (`WorkspaceAuditLogListSerializer` below), NOT
# `WorkspaceAuditLogSerializer(..., fields=AUDIT_LOG_LIST_FIELDS)` -
# `DynamicBaseSerializer.__init__` (plane/app/serializers/base.py)
# immediately overwrites its own `fields` kwarg with `self.expand`
# (`fields = self.expand`, right after popping `fields` off `kwargs`), so
# passing `fields=...` to any `DynamicBaseSerializer` subclass is, as
# written, a no-op everywhere in this codebase today - it never narrows
# the output. Given that pre-existing behavior, this deliberately does
# NOT rely on it for something exigence-mandated (list vs. detail payload
# shape) rather than inheriting a latent bug shared by many older call
# sites elsewhere in this fork (out of scope to fix here).
AUDIT_LOG_LIST_FIELDS = (
    "id",
    "workspace",
    "event_type",
    "actor",
    "actor_email_snapshot",
    "target_user",
    "target_email_snapshot",
    "target_type",
    "target_id",
    "ip_address",
    "created_at",
)


class WorkspaceAuditLogListSerializer(BaseSerializer):
    actor = UserLiteSerializer(read_only=True)
    target_user = UserLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceAuditLog
        fields = AUDIT_LOG_LIST_FIELDS
        read_only_fields = AUDIT_LOG_LIST_FIELDS


class WorkspaceAuditLogSerializer(DynamicBaseSerializer):
    actor = UserLiteSerializer(read_only=True)
    target_user = UserLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceAuditLog
        fields = "__all__"
        read_only_fields = [f.name for f in WorkspaceAuditLog._meta.fields]


class WorkspaceAuditLogExportSerializer(DynamicBaseSerializer):
    """Flat (no nested serializers) - built for `DataExporter`/CSV, where
    a nested dict per row is awkward. Emails/ids only, no relation
    objects."""

    actor_email = serializers.SerializerMethodField()
    target_user_email = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceAuditLog
        fields = (
            "id",
            "workspace_id",
            "event_type",
            "actor_email",
            "target_user_email",
            "target_type",
            "target_id",
            "old_value",
            "new_value",
            "metadata",
            "ip_address",
            "created_at",
        )

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor_id else obj.actor_email_snapshot

    def get_target_user_email(self, obj):
        return obj.target_user.email if obj.target_user_id else obj.target_email_snapshot
