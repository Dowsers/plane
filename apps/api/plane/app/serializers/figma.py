# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Session-authenticated (plane.app) serializer for the workspace-level Figma
OAuth connection - the settings-UI-facing half. The issue-scoped
FigmaFileLink CRUD used by the plugin lives in plane.api.serializers.figma
instead (token-authenticated, see plane/api/views/figma.py), matching the
existing convention of IssueLink's serializer living in plane.api.serializers
even though app-side code may reuse it too.
"""

# Module imports
from .base import BaseSerializer
from plane.db.models import FigmaWorkspaceConnection


class FigmaWorkspaceConnectionSerializer(BaseSerializer):
    class Meta:
        model = FigmaWorkspaceConnection
        fields = [
            "id",
            "workspace_id",
            "figma_team_id",
            "figma_team_name",
            "figma_user_id",
            "figma_user_handle",
            "token_expires_at",
            "is_active",
            "created_at",
        ]
        # access_token/refresh_token are never exposed over the API.
        read_only_fields = fields
