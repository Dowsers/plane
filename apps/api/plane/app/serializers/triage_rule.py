# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re

# Third party frameworks
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import TriageRule, TriageRuleAction, TriageRuleCondition


class TriageRuleConditionSerializer(BaseSerializer):
    class Meta:
        model = TriageRuleCondition
        fields = ["id", "field", "operator", "value", "case_sensitive"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        if attrs.get("operator") == "REGEX":
            try:
                re.compile(attrs.get("value", ""))
            except re.error as e:
                raise serializers.ValidationError({"value": f"Invalid regex: {e}"})
        return attrs


class TriageRuleActionSerializer(BaseSerializer):
    class Meta:
        model = TriageRuleAction
        fields = ["id", "action_type", "priority", "state", "labels", "assignees"]
        read_only_fields = ["id"]


class TriageRuleSerializer(BaseSerializer):
    conditions = TriageRuleConditionSerializer(many=True, read_only=True)
    actions = TriageRuleActionSerializer(many=True, read_only=True)

    class Meta:
        model = TriageRule
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "name",
            "description",
            "is_active",
            "sort_order",
            "stop_on_match",
            "is_valid",
            "conditions",
            "actions",
        ]
        read_only_fields = ["id", "workspace_id", "project_id", "is_valid"]
