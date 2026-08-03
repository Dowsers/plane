# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from plane.db.models import IssueView, NaturalLanguageFilterQuery, UserFavorite, ViewSubscription
from plane.utils.filters import ComplexFilterBackend
from plane.utils.issue_filters import issue_filters


class ViewIssueListSerializer(serializers.Serializer):
    def get_assignee_ids(self, instance):
        return [assignee.assignee_id for assignee in instance.issue_assignee.all()]

    def get_label_ids(self, instance):
        return [label.label_id for label in instance.label_issue.all()]

    def get_module_ids(self, instance):
        return [module.module_id for module in instance.issue_module.all()]

    def to_representation(self, instance):
        data = {
            "id": instance.id,
            "name": instance.name,
            "state_id": instance.state_id,
            "sort_order": instance.sort_order,
            "completed_at": instance.completed_at,
            "estimate_point": instance.estimate_point_id,
            "priority": instance.priority,
            "start_date": instance.start_date,
            "target_date": instance.target_date,
            "sequence_id": instance.sequence_id,
            "project_id": instance.project_id,
            "parent_id": instance.parent_id,
            "cycle_id": instance.cycle_id,
            "sub_issues_count": instance.sub_issues_count,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
            "created_by": instance.created_by_id,
            "updated_by": instance.updated_by_id,
            "attachment_count": instance.attachment_count,
            "link_count": instance.link_count,
            "is_draft": instance.is_draft,
            "archived_at": instance.archived_at,
            "state__group": instance.state.group if instance.state else None,
            "assignee_ids": self.get_assignee_ids(instance),
            "label_ids": self.get_label_ids(instance),
            "module_ids": self.get_module_ids(instance),
        }
        return data


class IssueViewSerializer(DynamicBaseSerializer):
    is_favorite = serializers.BooleanField(read_only=True)

    class Meta:
        model = IssueView
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "query",
            "owned_by",
            "is_locked",
        ]

    def validate_rich_filters(self, value):
        """Enforce the same depth/size limits on the save path that
        ComplexFilterBackend already enforces on the query path - see
        docs/feature-specs/04-views-filters.md ("Groupes de filtres
        imbriques AND/OR") in plane-selfhost. Without this, a saved view
        could persist a tree that later fails validation for every viewer.
        """
        if value:
            backend = ComplexFilterBackend()
            backend._validate_structure(value, max_depth=backend.default_max_depth, current_depth=1)
            total_conditions = backend._count_leaf_conditions(value)
            if total_conditions > backend.default_max_conditions:
                raise serializers.ValidationError(
                    f"Filter has too many conditions (max {backend.default_max_conditions}); "
                    f"found {total_conditions}"
                )
        return value

    def create(self, validated_data):
        query_params = validated_data.get("filters", {})
        if bool(query_params):
            validated_data["query"] = issue_filters(query_params, "POST")
        else:
            validated_data["query"] = {}
        return IssueView.objects.create(**validated_data)

    def update(self, instance, validated_data):
        query_params = validated_data.get("filters", {})
        if bool(query_params):
            validated_data["query"] = issue_filters(query_params, "POST")
        else:
            validated_data["query"] = {}
        validated_data["query"] = issue_filters(query_params, "PATCH")

        # Cascade-cleanup other users' favorites on a Public -> Private
        # transition - see docs/feature-specs/04-views-filters.md
        # ("Vues privees/personnelles") in plane-selfhost.
        previous_access = instance.access
        new_access = validated_data.get("access", previous_access)
        if previous_access == 1 and new_access == 0:
            UserFavorite.objects.filter(entity_type="view", entity_identifier=instance.id).exclude(
                user_id=instance.owned_by_id
            ).delete()

        return super().update(instance, validated_data)


class ViewSubscriptionSerializer(BaseSerializer):
    issue_view_name = serializers.CharField(source="issue_view.name", read_only=True)

    class Meta:
        model = ViewSubscription
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "issue_view",
            "subscriber",
        ]


class NaturalLanguageFilterQuerySerializer(BaseSerializer):
    """Read-only representation of a logged NL filter assistant call - see
    docs/feature-specs/04-views-filters.md ("Assistant de filtre en langage
    naturel") in plane-selfhost. Every field is server-computed (parsed
    query result / audit log entry), so the whole serializer is read-only -
    there is no create/update path through this serializer, rows are only
    ever created directly by the parsing endpoint.
    """

    class Meta:
        model = NaturalLanguageFilterQuery
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "raw_query",
            "detected_language",
            "resolved_filters",
            "restatement",
            "unresolved_terms",
            "status",
            "latency_ms",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
