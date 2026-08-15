# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Token-authenticated (plane.api, mounted at /api/v1/) serializer for
FigmaFileLink - this is the "backend API surface the Figma plugin would
call against" (see docs/feature-specs/07-integrations-git.md, "4. Plugin
Figma" in plane-selfhost) since exigence 3 has the plugin authenticate via
a Plane personal API token, not a session cookie.
"""

from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import FigmaFileLink


class FigmaFileLinkSerializer(BaseSerializer):
    class Meta:
        model = FigmaFileLink
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "last_synced_at",
            "last_sync_error",
        ]


class FigmaFileLinkCreateSerializer(BaseSerializer):
    class Meta:
        model = FigmaFileLink
        fields = [
            "figma_file_key",
            "figma_node_id",
            "figma_file_name",
            "figma_node_name",
            "url",
            "thumbnail_url",
            "sync_status_enabled",
        ]

    def validate_url(self, value):
        import re

        if not re.match(r"^https://(www\.)?figma\.com/(file|design|proto)/", value):
            raise serializers.ValidationError(
                "Only figma.com file/design/proto URLs are accepted for a Figma link."
            )
        return value
