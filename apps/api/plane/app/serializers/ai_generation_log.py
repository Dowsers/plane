# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from .user import UserLiteSerializer
from plane.db.models import AIGenerationLog


class AIGenerationLogSerializer(BaseSerializer):
    """Read-only admin audit trail row - category 9 feature 6, exigence 13
    (docs/feature-specs/09-ai-features.md "6. Redaction assistee des mises
    a jour de statut" in plane-selfhost). Every field is server-computed at
    generation time, so this is entirely read-only, same convention as
    `NaturalLanguageFilterQuerySerializer`.
    """

    triggered_by_detail = UserLiteSerializer(read_only=True, source="triggered_by")

    class Meta:
        model = AIGenerationLog
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "update_id",
            "status",
            "provider",
            "model_name",
            "token_usage",
            "error_message",
            "triggered_by",
            "triggered_by_detail",
            "created_at",
        ]
        read_only_fields = fields
