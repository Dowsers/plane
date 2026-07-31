# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import (
    ProjectTemplate,
    ProjectTemplateState,
    ProjectTemplateLabel,
    ProjectTemplateMember,
    ProjectTemplateIssue,
)


class ProjectTemplateWriteSerializer(BaseSerializer):
    class Meta:
        model = ProjectTemplate
        fields = ["id", "name", "description", "logo_props", "network", "linked_initiative", "add_creator_as_lead"]

    def validate(self, data):
        name = data.get("name")
        if name is not None:
            workspace_id = self.context["workspace_id"]
            existing = ProjectTemplate.objects.filter(workspace_id=workspace_id, name__iexact=name)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError({"name": "A project template with this name already exists"})
        return data


class ProjectTemplateStateSerializer(BaseSerializer):
    class Meta:
        model = ProjectTemplateState
        fields = ["id", "name", "color", "group", "sequence", "default"]
        read_only_fields = fields


class ProjectTemplateLabelSerializer(BaseSerializer):
    class Meta:
        model = ProjectTemplateLabel
        fields = ["id", "parent", "name", "color", "sort_order"]
        read_only_fields = fields


class ProjectTemplateMemberSerializer(BaseSerializer):
    class Meta:
        model = ProjectTemplateMember
        fields = ["id", "member", "role"]
        read_only_fields = fields


class ProjectTemplateIssueSerializer(BaseSerializer):
    label_ids = serializers.PrimaryKeyRelatedField(source="labels", many=True, read_only=True)
    assignee_ids = serializers.PrimaryKeyRelatedField(source="assignees", many=True, read_only=True)

    class Meta:
        model = ProjectTemplateIssue
        fields = [
            "id",
            "name",
            "description_html",
            "priority",
            "state",
            "parent",
            "label_ids",
            "assignee_ids",
            "sort_order",
            "target_date_offset_days",
        ]
        read_only_fields = fields


class ProjectTemplateListSerializer(BaseSerializer):
    """Compact shape for the template gallery - counts only, no nested payload."""

    total_states = serializers.IntegerField(read_only=True)
    total_labels = serializers.IntegerField(read_only=True)
    total_issues = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProjectTemplate
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "logo_props",
            "network",
            "linked_initiative",
            "add_creator_as_lead",
            "usage_count",
            "total_states",
            "total_labels",
            "total_issues",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = fields


class ProjectTemplateSerializer(BaseSerializer):
    """Full nested shape for the template editor / detail view."""

    states = ProjectTemplateStateSerializer(many=True, read_only=True)
    labels = ProjectTemplateLabelSerializer(many=True, read_only=True)
    members = ProjectTemplateMemberSerializer(many=True, read_only=True)
    issues = ProjectTemplateIssueSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectTemplate
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "logo_props",
            "network",
            "linked_initiative",
            "add_creator_as_lead",
            "usage_count",
            "states",
            "labels",
            "members",
            "issues",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = fields
