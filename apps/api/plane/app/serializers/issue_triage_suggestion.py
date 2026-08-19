# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializer for `IssueTriageSuggestion` (category 9, feature 1 - AI-assisted
auto-triage, docs/feature-specs/09-ai-features.md in plane-selfhost).
Read-only end to end - every mutation goes through the dedicated
`regenerate`/`resolve` actions
(`plane.app.views.issue_triage_suggestion`), never a direct PATCH on this
serializer, same convention as `IssueCommentSummarySerializer`.
"""

from plane.db.models import IssueTriageSuggestion

from .base import BaseSerializer


class IssueTriageSuggestionSerializer(BaseSerializer):
    class Meta:
        model = IssueTriageSuggestion
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "suggested_module_ids",
            "suggested_assignee_ids",
            "suggested_label_ids",
            "confidence_modules",
            "confidence_assignees",
            "confidence_labels",
            "similar_issue_ids",
            "status",
            "applied_fields",
            "rejected_fields",
            "expired_fields",
            "generated_by_model",
            "resolved_by",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
