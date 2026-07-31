# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from .project import ProjectLiteSerializer
from .user import UserLiteSerializer
from plane.db.models import Initiative, InitiativeActivity, InitiativeProject, User


class InitiativeWriteSerializer(BaseSerializer):
    lead_id = serializers.PrimaryKeyRelatedField(
        source="lead", queryset=User.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Initiative
        fields = [
            "id",
            "name",
            "description",
            "description_html",
            "status",
            "lead_id",
            "start_date",
            "target_date",
            "logo_props",
            "sort_order",
            "external_id",
            "external_source",
        ]

    def validate(self, data):
        if (
            data.get("start_date", None) is not None
            and data.get("target_date", None) is not None
            and data.get("start_date") > data.get("target_date")
        ):
            raise serializers.ValidationError("Start date cannot exceed target date")
        return data


class InitiativeSerializer(DynamicBaseSerializer):
    total_issues = serializers.IntegerField(read_only=True)
    completed_issues = serializers.IntegerField(read_only=True)
    total_projects = serializers.IntegerField(read_only=True)
    project_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Initiative
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "description_html",
            "status",
            "lead_id",
            "start_date",
            "target_date",
            "health",
            "logo_props",
            "sort_order",
            "external_id",
            "external_source",
            "total_issues",
            "completed_issues",
            "total_projects",
            "project_ids",
            "progress",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = fields

    def get_progress(self, obj):
        total = getattr(obj, "total_issues", 0) or 0
        if total == 0:
            return None
        completed = getattr(obj, "completed_issues", 0) or 0
        return round((completed / total) * 100)


class InitiativeProjectSerializer(BaseSerializer):
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    total_issues = serializers.IntegerField(read_only=True)
    completed_issues = serializers.IntegerField(read_only=True)

    class Meta:
        model = InitiativeProject
        fields = [
            "id",
            "initiative_id",
            "project_id",
            "project_detail",
            "sort_order",
            "total_issues",
            "completed_issues",
            "created_at",
        ]
        read_only_fields = fields


class InitiativeActivitySerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = InitiativeActivity
        fields = [
            "id",
            "initiative_id",
            "actor",
            "actor_detail",
            "verb",
            "field",
            "old_value",
            "new_value",
            "comment",
            "created_at",
        ]
        read_only_fields = fields
