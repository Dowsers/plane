# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Exigence 12, docs/feature-specs/09-ai-features.md ("3. Assistant de chat
IA in-app") in plane-selfhost - "le nombre d'appels au LLM par utilisateur
et par workspace est limite". Scoped per (user, workspace) - like
`plane.throttles.digest.DigestPreviewThrottle` and unlike
`IssueCommentSummaryThrottle`/`DuplicateDetectionBackfillThrottle` (both
per-workspace only) - a shared workspace-wide budget would let one chatty
member starve every other member's chat usage, which the spec's own
wording ("par utilisateur ET par workspace") explicitly rules out.

Admin-configurable per workspace
(`Workspace.ai_assistant_max_messages_per_user_per_hour`, default 20) -
same technique `ProjectUpdateAIDraftThrottle` uses for a rate
`parse_rate()` can't express (a value that isn't fixed at compile time).
"""

from rest_framework.throttling import SimpleRateThrottle


class AIChatMessageThrottle(SimpleRateThrottle):
    scope = "ai_chat_message"

    def get_cache_key(self, request, view):
        slug = view.kwargs.get("slug")
        if not slug or not request.user or request.user.is_anonymous:
            return None
        return f"throttle_ai_chat_message_{slug}_{request.user.id}"

    def allow_request(self, request, view):
        from plane.db.models import Workspace

        slug = view.kwargs.get("slug")
        workspace = (
            Workspace.objects.filter(slug=slug).only("id", "ai_assistant_max_messages_per_user_per_hour").first()
        )
        limit = workspace.ai_assistant_max_messages_per_user_per_hour if workspace else 20
        self.num_requests, self.duration = max(int(limit), 0), 3600
        return super().allow_request(request, view)
