# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializer for `IssueDuplicateSuggestion` (category 9, feature 2 -
duplicate/similarity detection, docs/feature-specs/09-ai-features.md in
plane-selfhost). Read-only end to end - every mutation goes through the
dedicated `dismiss`/`confirm` actions
(`plane.app.views.issue_duplicate_suggestion`), never a direct PATCH, same
convention as `IssueTriageSuggestionSerializer`.

A few denormalized fields about the CANDIDATE issue (`suggested_issue_name`/
`suggested_issue_state_id`) are included so the UI can render a suggestion
card (title, state) without a second round-trip per exigence 4's own list.
"""

from plane.db.models import IssueDuplicateSuggestion

from .base import BaseSerializer


class IssueDuplicateSuggestionSerializer(BaseSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        suggested_issue = getattr(instance, "suggested_issue", None)
        data["suggested_issue_name"] = suggested_issue.name if suggested_issue else None
        data["suggested_issue_project_id"] = str(suggested_issue.project_id) if suggested_issue else None
        data["suggested_issue_state_id"] = (
            str(suggested_issue.state_id) if suggested_issue and suggested_issue.state_id else None
        )
        return data

    class Meta:
        model = IssueDuplicateSuggestion
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "suggested_issue",
            "similarity_score",
            "status",
            "explanation",
            "resolved_by",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
