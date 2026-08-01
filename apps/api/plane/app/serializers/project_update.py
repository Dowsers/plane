# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from .user import UserLiteSerializer
from plane.db.models import ProjectUpdate


class ProjectUpdateWriteSerializer(BaseSerializer):
    class Meta:
        model = ProjectUpdate
        fields = ["id", "status", "description_html", "generated_summary_json", "is_summary_edited"]


class ProjectUpdateSerializer(BaseSerializer):
    created_by_detail = UserLiteSerializer(read_only=True, source="created_by")

    class Meta:
        model = ProjectUpdate
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "status",
            "description_html",
            "generated_summary_json",
            "is_summary_edited",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_detail",
        ]
        read_only_fields = fields
