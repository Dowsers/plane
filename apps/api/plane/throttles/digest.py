# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 5 - "Digest periodique automatise", exigence 15 -
"limite a N requetes par heure (ex. 3)" on
`POST .../users/me/digests/preview/`. Scoped per (user, workspace) - unlike
`IssueCommentSummaryThrottle`/`DuplicateDetectionBackfillThrottle` (both
per-workspace only), the spec explicitly frames this as a per-USER quota
("un utilisateur peut demander..."), so one member hammering the preview
button must not exhaust a shared workspace-wide budget other members would
also draw from.
"""

from rest_framework.throttling import SimpleRateThrottle


class DigestPreviewThrottle(SimpleRateThrottle):
    scope = "digest_preview"

    def get_cache_key(self, request, view):
        slug = view.kwargs.get("slug")
        if not slug or not request.user or request.user.is_anonymous:
            return None
        return f"throttle_digest_preview_{slug}_{request.user.id}"
