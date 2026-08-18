# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Exigence 11, docs/feature-specs/09-ai-features.md ("6. Redaction assistee
des mises a jour de statut") in plane-selfhost - a per-workspace daily cap
on `POST .../updates/draft/` (AI-assisted status update drafting)
generation calls.

Unlike `IssueCommentSummaryThrottle` (a fixed rate read from
`settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`), this limit is a
per-workspace ADMIN-CONFIGURABLE field
(`Workspace.ai_update_daily_generation_limit`, default 50) - so
`allow_request` looks it up per request and overrides `num_requests`/
`duration` before delegating to `SimpleRateThrottle`, the same technique
`NLFilterAssistantThrottle` uses for a rate `parse_rate()` can't express
(there, a fixed-but-unusual window; here, a value that isn't fixed at all).
The `DEFAULT_THROTTLE_RATES` entry for this scope is a fallback only, used
if `Workspace` can't be resolved from the URL, and kept for documentation
parity with sibling throttles.
"""

from rest_framework.throttling import SimpleRateThrottle


class ProjectUpdateAIDraftThrottle(SimpleRateThrottle):
    scope = "project_update_ai_draft"

    def get_cache_key(self, request, view):
        slug = view.kwargs.get("slug")
        if not slug:
            return None
        return self.cache_format % {"scope": self.scope, "ident": slug}

    def allow_request(self, request, view):
        from plane.db.models import Workspace

        slug = view.kwargs.get("slug")
        workspace = Workspace.objects.filter(slug=slug).only("id", "ai_update_daily_generation_limit").first()
        limit = workspace.ai_update_daily_generation_limit if workspace else 50
        self.num_requests, self.duration = max(int(limit), 0), 86400
        return super().allow_request(request, view)
