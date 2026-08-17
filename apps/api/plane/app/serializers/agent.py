# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializers for the workspace-agent actor type - category 9, feature 7
(docs/feature-specs/09-ai-features.md "7. Type d'acteur agent de premiere
classe" in plane-selfhost).
"""

from rest_framework import serializers

from plane.db.models import AgentProfile, APIToken

from .base import BaseSerializer
from .user import UserLiteSerializer


class AgentProfileSerializer(BaseSerializer):
    user_id = serializers.PrimaryKeyRelatedField(source="user", read_only=True)
    display_name = serializers.CharField(source="user.display_name", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    avatar_url = serializers.CharField(source="user.avatar_url", read_only=True)
    created_by = UserLiteSerializer(read_only=True)
    # Annotated on the queryset (see AgentProfileViewSet.get_queryset) -
    # exigence "nombre de projets ou il est membre" (spec's own "Considerations
    # API/UX" section, GET /workspaces/{slug}/agents/).
    project_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = AgentProfile
        fields = [
            "id",
            "user_id",
            "display_name",
            "email",
            "avatar_url",
            "workspace",
            "agent_type",
            "status",
            "description",
            "created_by",
            "last_seen_at",
            "created_at",
            "updated_at",
            "project_count",
        ]
        read_only_fields = [
            "id",
            "user_id",
            "display_name",
            "email",
            "avatar_url",
            "workspace",
            "created_by",
            "last_seen_at",
            "created_at",
            "updated_at",
            "project_count",
        ]


class AgentAPITokenSerializer(BaseSerializer):
    """Same shape as the personal `APITokenSerializer` - includes the raw
    `token` value, so this is ONLY ever used for the issuance response
    (`POST .../tokens/`), matching the existing personal-token UX
    (`plane.app.views.api.ApiTokenEndpoint`). Listing existing tokens must
    use `AgentAPITokenReadSerializer` below instead - `read_only_fields`
    only gates writes, it does not hide a field from serialized output."""

    class Meta:
        model = APIToken
        fields = "__all__"
        read_only_fields = [
            "id",
            "token",
            "expired_at",
            "created_at",
            "updated_at",
            "workspace",
            "user",
            "user_type",
            "agent",
            "is_active",
            "last_used",
            "rate_limit_tier",
            "rate_limit_overridden_by",
            "rate_limit_overridden_at",
            "rate_limit_override_reason",
        ]


class AgentAPITokenReadSerializer(BaseSerializer):
    """Same field set as `AgentAPITokenSerializer` minus the raw `token`
    value - used for `GET .../tokens/` so a past token is never
    re-exposed after issuance, mirroring `plane.app.serializers.api.
    APITokenReadSerializer`."""

    class Meta:
        model = APIToken
        exclude = ("token",)
