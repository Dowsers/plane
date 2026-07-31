# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from plane.db.models import Milestone


class MilestoneWriteSerializer(BaseSerializer):
    class Meta:
        model = Milestone
        fields = ["id", "name", "description", "target_date", "sort_order", "external_id", "external_source"]

    def validate(self, data):
        name = data.get("name")
        if name is not None:
            project_id = self.context["project_id"]
            existing = Milestone.objects.filter(project_id=project_id, name=name)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError({"name": "A milestone with this name already exists"})
        return data


class MilestoneSerializer(DynamicBaseSerializer):
    total_issues = serializers.IntegerField(read_only=True)
    completed_issues = serializers.IntegerField(read_only=True)
    cancelled_issues = serializers.IntegerField(read_only=True)
    completion_percentage = serializers.SerializerMethodField()

    class Meta:
        model = Milestone
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "name",
            "description",
            "target_date",
            "sort_order",
            "external_id",
            "external_source",
            "total_issues",
            "completed_issues",
            "cancelled_issues",
            "completion_percentage",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = fields

    def get_completion_percentage(self, obj):
        total = getattr(obj, "total_issues", 0) or 0
        cancelled = getattr(obj, "cancelled_issues", 0) or 0
        denominator = total - cancelled
        if denominator <= 0:
            return None
        completed = getattr(obj, "completed_issues", 0) or 0
        return round((completed / denominator) * 100)
