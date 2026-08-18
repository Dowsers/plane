# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Serializer for `IssueCommentSummary` (category 9, feature 4 - AI thread
summary, docs/feature-specs/09-ai-features.md in plane-selfhost).

`error_message` is intentionally never a field here - exigence 9 requires
the raw provider error to stay server-side only (logged, not shown). The
client only ever learns `status == "FAILED"`, which is enough to render a
generic "couldn't generate the summary, try again" message.

`is_stale` is a computed field (exigence 6): compares the live comment set's
fingerprint against the stored `source_comments_hash` so the frontend can
show a "new comments since this summary" badge without having to reload and
diff the whole comment list itself.
"""

from rest_framework import serializers

from plane.db.models import IssueCommentSummary
from plane.utils.issue_comment_summary import current_comments_hash_for_issue

from .base import BaseSerializer


class IssueCommentSummarySerializer(BaseSerializer):
    is_stale = serializers.SerializerMethodField()

    class Meta:
        model = IssueCommentSummary
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "summary_text",
            "citations",
            "source_comment_count",
            "status",
            "model_used",
            "generated_by",
            "generated_at",
            "is_stale",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_is_stale(self, obj):
        return current_comments_hash_for_issue(obj.issue_id) != obj.source_comments_hash
