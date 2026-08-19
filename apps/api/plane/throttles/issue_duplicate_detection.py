# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 2 - "Detection de doublons/similarite". Rate limit
on `POST .../duplicate-detection-config/backfill/` (Considerations API/UX
section - "declenche le job de rattrapage (admin only, rate-limite)") - a
backfill enqueues potentially thousands of per-issue embedding calls
(`plane.bgtasks.issue_embedding_task.backfill_issue_embeddings_batch`), so
repeated admin clicks must not be able to pile up duplicate full-workspace
sweeps. Scoped per WORKSPACE, same shape as
`plane.throttles.issue_comment_summary.IssueCommentSummaryThrottle`.
"""

from rest_framework.throttling import SimpleRateThrottle


class DuplicateDetectionBackfillThrottle(SimpleRateThrottle):
    scope = "duplicate_detection_backfill"

    def get_cache_key(self, request, view):
        slug = view.kwargs.get("slug")
        if not slug:
            return None
        return f"throttle_duplicate_detection_backfill_{slug}"
