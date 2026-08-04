# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import RecurringIssueTemplate


class RecurringIssueTemplateSerializer(BaseSerializer):
    # `_id`-suffixed FK output, matching IssueSerializer's own convention
    # (e.g. `state_id`) rather than DRF's default bare-name
    # PrimaryKeyRelatedField that `fields = [...]` would otherwise
    # auto-generate for "state"/"estimate_point".
    state_id = serializers.PrimaryKeyRelatedField(source="state", read_only=True)
    estimate_point_id = serializers.PrimaryKeyRelatedField(source="estimate_point", read_only=True)
    label_ids = serializers.PrimaryKeyRelatedField(source="labels", many=True, read_only=True)
    assignee_ids = serializers.PrimaryKeyRelatedField(source="assignees", many=True, read_only=True)

    class Meta:
        model = RecurringIssueTemplate
        fields = [
            "id",
            "workspace",
            "project",
            "name",
            "description",
            "description_html",
            "priority",
            "state_id",
            "estimate_point_id",
            "frequency",
            "interval",
            "weekdays",
            "day_of_month",
            "month_of_year",
            "timezone",
            "start_date",
            "end_date",
            "max_occurrences",
            "occurrences_generated",
            "next_run_at",
            "is_active",
            "label_ids",
            "assignee_ids",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "occurrences_generated",
            "next_run_at",
            "created_at",
            "updated_at",
            "created_by",
        ]
