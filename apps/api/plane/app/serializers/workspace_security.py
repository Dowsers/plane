# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 6 ("Politiques de securite configurables") -
`WorkspaceSecurityPolicy`/`WorkspaceVerifiedDomain` serializers.
"""

from rest_framework import serializers

from plane.db.models import AllowedAuthMethod, WorkspaceSecurityPolicy, WorkspaceVerifiedDomain

from .base import DynamicBaseSerializer


class WorkspaceSecurityPolicySerializer(DynamicBaseSerializer):
    class Meta:
        model = WorkspaceSecurityPolicy
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def validate_allowed_auth_methods(self, value):
        valid_values = {choice.value for choice in AllowedAuthMethod}
        invalid = [v for v in (value or []) if v not in valid_values]
        if invalid:
            raise serializers.ValidationError(f"Invalid auth method(s): {invalid}")
        return value

    def validate_session_timeout_minutes(self, value):
        # Exigence 7 - "5 a 43200 (30 jours max)". `null` is allowed
        # separately (falls back to the instance default), only a
        # non-null value is range-checked here.
        if value is not None and not (5 <= value <= 43200):
            raise serializers.ValidationError("session_timeout_minutes must be between 5 and 43200 (30 days).")
        return value


class WorkspaceVerifiedDomainSerializer(DynamicBaseSerializer):
    class Meta:
        model = WorkspaceVerifiedDomain
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "verification_token",
            "is_verified",
            "verified_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def validate_domain(self, value):
        value = (value or "").strip().lower()
        if not value or "." not in value or " " in value:
            raise serializers.ValidationError("Enter a valid domain (e.g. example.com).")
        return value
