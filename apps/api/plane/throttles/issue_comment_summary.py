# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Exigence 13 (docs/feature-specs/09-ai-features.md, "4. Resume IA de fils de
discussion", in plane-selfhost) - a rate limit on `POST .../ai-summary/` to
bound LLM call volume/cost. Mirrors `plane.throttles.asset.AssetRateThrottle`
(fact confirmed simplest real precedent in this codebase for a scoped
`SimpleRateThrottle`) rather than the heavier Redis sliding-window mechanism
built for category 8's flexible-query rate limiting - overkill for a single
POST endpoint.

Scoped per WORKSPACE (not per-issue/per-project) to match the spec's own
wording ("rate-limit par workspace") - one workspace hammering the button
across many issues should not be able to bypass the limit by spreading
requests across issues.
"""

from rest_framework.throttling import SimpleRateThrottle


class IssueCommentSummaryThrottle(SimpleRateThrottle):
    scope = "issue_comment_summary"

    def get_cache_key(self, request, view):
        slug = view.kwargs.get("slug")
        if not slug:
            return None
        return f"throttle_issue_comment_summary_{slug}"
