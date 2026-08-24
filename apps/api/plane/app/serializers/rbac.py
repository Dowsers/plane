# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 4 - serializers for the new RBAC catalogue/
bundle/role surface. `PermissionSchemeItem` create/update/delete is
handled explicitly in the view layer (`plane.app.views.rbac`), not via a
nested-writable serializer field - this fork's own `DynamicBaseSerializer.
__init__` already silently no-ops a `fields=` kwarg (see `audit.py`'s own
documented finding), and a bespoke nested-write here would need the same
kind of pre/post bookkeeping (diff old vs. new items, invalidate every
affected role's cache) the view needs to do anyway around
`serializer.save()` - keeping it all in one place in the view is more
honest than splitting it across two layers.
"""

from rest_framework import serializers

from plane.db.models import Permission, PermissionScheme, PermissionSchemeItem, WorkspaceRole, WorkspaceRoleScheme
from plane.utils.rbac import get_role_permissions, validate_scheme_item_condition

from .base import BaseSerializer


class PermissionSerializer(BaseSerializer):
    """Read-only catalogue (exigence 1) - no create/update/delete
    endpoint exists for this model anywhere in this feature."""

    class Meta:
        model = Permission
        fields = ("id", "key", "category", "label", "description", "supported_conditions")
        read_only_fields = fields


class PermissionSchemeItemSerializer(BaseSerializer):
    permission = PermissionSerializer(read_only=True)

    class Meta:
        model = PermissionSchemeItem
        fields = ("id", "permission", "condition")
        read_only_fields = fields


class PermissionSchemeItemInputSerializer(serializers.Serializer):
    """One line of the `items` array a bundle create/update PATCH body
    sends - validated (exigence 8) BEFORE any write happens, not silently
    at evaluation time."""

    permission_id = serializers.PrimaryKeyRelatedField(source="permission", queryset=Permission.objects.all())
    condition = serializers.ChoiceField(choices=["NONE", "CREATOR_ONLY", "PROJECT_LEAD_ONLY"], default="NONE")

    def validate(self, attrs):
        validate_scheme_item_condition(attrs["permission"], attrs["condition"])
        return attrs


class PermissionSchemeSerializer(BaseSerializer):
    items = PermissionSchemeItemSerializer(many=True, read_only=True)

    class Meta:
        model = PermissionScheme
        fields = ("id", "workspace", "name", "description", "is_system", "items", "created_at", "updated_at")
        read_only_fields = ("id", "workspace", "is_system", "items", "created_at", "updated_at")


class WorkspaceRoleSerializer(BaseSerializer):
    schemes = serializers.SerializerMethodField()
    effective_permissions = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceRole
        fields = (
            "id",
            "workspace",
            "name",
            "description",
            "is_system",
            "legacy_role_value",
            "is_owner_equivalent",
            "schemes",
            "effective_permissions",
            "member_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "workspace", "is_system", "is_owner_equivalent", "created_at", "updated_at")

    def get_schemes(self, obj):
        links = WorkspaceRoleScheme.objects.filter(role=obj).select_related("scheme")
        return [{"id": str(link.scheme_id), "name": link.scheme.name} for link in links]

    def get_effective_permissions(self, obj):
        # Dogfoods the very cache this feature builds (exigence 10) on
        # every role read, not just the resolver's own internal callers.
        return get_role_permissions(obj.id)

    def get_member_count(self, obj):
        return obj.members.filter(is_active=True).count()

    def validate_legacy_role_value(self, value):
        if value is not None and value not in WorkspaceRole.LEGACY_ROLE_VALUES:
            raise serializers.ValidationError(
                f"legacy_role_value must be one of {WorkspaceRole.LEGACY_ROLE_VALUES}."
            )
        return value
