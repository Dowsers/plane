# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Cross-workspace velocity-by-cycle rollup - see
docs/feature-specs/05-insights-analytics.md, section 2. Every dated, closed
cycle across every project the requesting user can see in the workspace
(same cross-project scoping as the rest of "Advance Analytics" - built on
`AdvanceAnalyticsBaseView`/`get_analytics_filters`), one row per cycle.

Guest role is deliberately excluded from this endpoint, matching the rest of
the pre-existing `AdvanceAnalytics*` family it lives alongside
(`AdvanceAnalyticsEndpoint`/`AdvanceAnalyticsStatsEndpoint`/
`AdvanceAnalyticsChartEndpoint`) - not a default left unconsidered.
"""

from typing import Any, Dict, List

from django.http import HttpRequest
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Cycle
from plane.utils.analytics_plot import cycle_progress_counts
from plane.utils.cache import cache_response

from .advance import AdvanceAnalyticsBaseView


class AdvanceAnalyticsVelocityEndpoint(AdvanceAnalyticsBaseView):
    def get_velocity_rollup(self) -> List[Dict[str, Any]]:
        now = timezone.now()
        # Every dated cycle that has already closed, across every project
        # `base_filters` resolves to (workspace + visible-project scoping,
        # optionally narrowed further by `project_ids`) - same cross-project
        # rollup engine as the rest of Advance Analytics.
        closed_cycles = (
            Cycle.objects.filter(
                **self.filters["base_filters"],
                start_date__isnull=False,
                end_date__isnull=False,
                end_date__lt=now,
            )
            .select_related("project")
            .order_by("end_date")
        )

        data = []
        for cycle in closed_cycles:
            # Reuses the exact same per-cycle counting logic as
            # `CycleProgressEndpoint`/`ProjectProgressEndpoint` (factored
            # into `cycle_progress_counts`) rather than re-deriving a second
            # query style for this workspace-level rollup - same reuse
            # pattern `ProjectProgressEndpoint` established for itself.
            # This is one query per cycle (N+1 by design) - acceptable,
            # bounded by the number of dated cycles in the workspace, not by
            # issue count.
            counts = cycle_progress_counts(slug=self._workspace_slug, project_id=cycle.project_id, cycle_id=cycle.id)
            data.append(
                {
                    "cycle_id": str(cycle.id),
                    "cycle_name": cycle.name,
                    "project_id": str(cycle.project_id),
                    "project_name": cycle.project.name,
                    "completed_issues": counts["completed_issues"],
                    "completed_estimate_points": counts["completed_estimate_points"],
                    "end_date": cycle.end_date,
                }
            )
        return data

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    @cache_response(timeout=60 * 15)
    def get(self, request: HttpRequest, slug: str) -> Response:
        self.initialize_workspace(slug, type="analytics")
        return Response(self.get_velocity_rollup(), status=status.HTTP_200_OK)
