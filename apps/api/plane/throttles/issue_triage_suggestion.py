# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Exigence 15, docs/feature-specs/09-ai-features.md ("1. Auto-triage assiste
par IA") in plane-selfhost - "une regeneration manuelle... limitee par un
rate-limit (ex. 1 requete/minute/issue)". Scoped per ISSUE (not per-
workspace like `IssueCommentSummaryThrottle`) since the spec explicitly
calls out a per-issue limit here - mirrors
`plane.throttles.asset.AssetRateThrottle`'s exact shape (simplest real
`SimpleRateThrottle` precedent keyed on a URL kwarg other than slug).
"""

from rest_framework.throttling import SimpleRateThrottle


class IssueTriageSuggestionRegenerateThrottle(SimpleRateThrottle):
    scope = "issue_triage_regenerate"

    def get_cache_key(self, request, view):
        issue_id = view.kwargs.get("issue_id")
        if not issue_id:
            return None
        return f"throttle_issue_triage_regenerate_{issue_id}"
