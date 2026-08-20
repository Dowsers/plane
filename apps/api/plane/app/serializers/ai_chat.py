# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializers for category 9 (AI features, docs/feature-specs/09-ai-features.md
in plane-selfhost), feature 3 - "Assistant de chat IA in-app". See
`plane.app.views.ai_chat` for the endpoints and `plane.db.models.ai_chat`
for the model shapes.
"""

from rest_framework import serializers

from plane.db.models import AIChangeProposal, AIConversation, AIMessage

from .base import BaseSerializer
from .user import UserLiteSerializer


class AIConversationSerializer(BaseSerializer):
    created_by_detail = UserLiteSerializer(read_only=True, source="created_by")

    class Meta:
        model = AIConversation
        fields = [
            "id",
            "workspace",
            "created_by",
            "created_by_detail",
            "context_type",
            "context_object_id",
            "title",
            "source",
            "is_archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace", "created_by", "source", "created_at", "updated_at"]


class AIMessageSerializer(BaseSerializer):
    class Meta:
        model = AIMessage
        fields = [
            "id",
            "conversation",
            "role",
            "content",
            "mode",
            "token_count_input",
            "token_count_output",
            "status",
            "error_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AIChangeProposalSerializer(BaseSerializer):
    reviewed_by_detail = UserLiteSerializer(read_only=True, source="reviewed_by")

    class Meta:
        model = AIChangeProposal
        fields = [
            "id",
            "message",
            "workspace",
            "project",
            "target_model",
            "target_object_id",
            "field_name",
            "proposed_value",
            "previous_value",
            "status",
            "reviewed_by",
            "reviewed_by_detail",
            "reviewed_at",
            "applied_at",
            "applied_activity_id",
            "expires_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AIConversationCreateSerializer(serializers.Serializer):
    """Write-only input validation for
    `POST .../ai-conversations/` - not a `ModelSerializer` since
    `workspace`/`created_by`/`source` are always set by the view, never
    from client input."""

    context_type = serializers.ChoiceField(choices=["workspace", "project", "issue", "cycle", "module", "page"])
    context_object_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    title = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["context_type"] != "workspace" and attrs.get("context_object_id") is None:
            raise serializers.ValidationError("'context_object_id' is required for this context_type.")
        return attrs


class AIConversationMessageCreateSerializer(serializers.Serializer):
    """Write-only input validation for
    `POST .../ai-conversations/<id>/messages/`."""

    content = serializers.CharField(allow_blank=False, trim_whitespace=True)
    mode = serializers.ChoiceField(choices=["ask", "propose"], default="ask")
