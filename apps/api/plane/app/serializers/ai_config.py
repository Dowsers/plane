# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializer for the shared per-workspace LLM config model - see
`plane.db.models.ai_config` for the full design rationale (category 9
infrastructure prerequisite).

`api_key` is intentionally NEVER a field on this serializer, matching this
fork's established convention for every other connector's secret
(`GithubWorkspaceConnectionSerializer`/`WorkspaceSentryConnectionSerializer`
never expose `access_token`/`api_token` either) - a client only ever learns
whether a key is configured (`is_configured`), never its value. Writes go
through the view directly (`request.data.get("api_key")`), not through this
serializer, so there is no `api_key` write path here either.
"""

from rest_framework import serializers

from plane.db.models import WorkspaceAIConfig

from .base import BaseSerializer


class WorkspaceAIConfigSerializer(BaseSerializer):
    is_configured = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceAIConfig
        fields = [
            "id",
            "workspace",
            "is_enabled",
            "provider",
            "api_base_url",
            "model_name",
            "is_configured",
            "connected_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_is_configured(self, obj):
        return bool(obj.api_key)
