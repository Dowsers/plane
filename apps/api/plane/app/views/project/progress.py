# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Project-level "Scope & velocity" cross-cycle chart - see
docs/feature-specs/05-insights-analytics.md, section
"1. Graphiques de progression cycle/projet", exigences 7 et 8. This is the
genuinely new surface described by that spec (the cycle-level
burndown/burn-up chart it also describes already existed and was ungated
before this patch - see the patch notes for the corrected premise).

Aggregates every dated cycle of the project, chronologically, and derives a
velocity-based projected completion date for the project's remaining
backlog from the last `Project.velocity_window_size` *closed* cycles.
"""

# Python imports
from statistics import mean

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Cycle, Issue, Project
from plane.utils.analytics_plot import cycle_progress_counts
from plane.utils.velocity import compute_velocity_projection


def _metric(counts, name, estimate_type):
    """Pick the issues- or points-flavoured value of a `cycle_progress_counts()` metric."""
    key = f"{name}_estimate_points" if estimate_type == "points" else f"{name}_issues"
    return counts.get(key) or 0


class ProjectProgressEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        # Same "does this project use point-based estimation" check already
        # used by `burndown_plot`/`CycleProgressEndpoint` - reused as-is.
        estimate_type = (
            "points"
            if Project.objects.filter(
                workspace__slug=slug,
                pk=project_id,
                estimate__isnull=False,
                estimate__type="points",
            ).exists()
            else "issues"
        )

        now = timezone.now()
        dated_cycles = list(
            Cycle.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                start_date__isnull=False,
                end_date__isnull=False,
            ).order_by("start_date")
        )

        cycles_payload = []
        for cycle in dated_cycles:
            # Reuses the exact same per-cycle counting logic as
            # `CycleProgressEndpoint` (factored into `cycle_progress_counts`)
            # rather than re-deriving a second, potentially-inconsistent
            # query style for this aggregate endpoint.
            counts = cycle_progress_counts(slug=slug, project_id=project_id, cycle_id=cycle.id)
            cycles_payload.append(
                {
                    "id": str(cycle.id),
                    "name": cycle.name,
                    "start_date": cycle.start_date,
                    "end_date": cycle.end_date,
                    "is_completed": cycle.end_date < now,
                    # Net scope assigned to the cycle (issues/points
                    # explicitly linked via CycleIssue) - exigence 7.
                    "scope": _metric(counts, "total", estimate_type),
                    "started": _metric(counts, "started", estimate_type),
                    "completed": _metric(counts, "completed", estimate_type),
                }
            )

        window_size = project.velocity_window_size or 3
        # Most-recently-closed first, then keep only the configured window
        # - exigence 7 ("N derniers cycles clos").
        closed_cycles = sorted(
            (c for c in cycles_payload if c["is_completed"]),
            key=lambda c: c["end_date"],
            reverse=True,
        )[:window_size]

        velocities = [c["completed"] for c in closed_cycles]
        avg_cycle_duration_days = (
            mean((c["end_date"] - c["start_date"]).total_seconds() / 86400 for c in closed_cycles)
            if closed_cycles
            else None
        )

        # Remaining project backlog: not completed, not cancelled - exigence 8.
        remaining_backlog_qs = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id).exclude(
            state__group__in=["completed", "cancelled"]
        )
        if estimate_type == "points":
            remaining_work = sum(
                float(value)
                for value in remaining_backlog_qs.filter(estimate_point__isnull=False).values_list(
                    "estimate_point__value", flat=True
                )
            )
        else:
            remaining_work = remaining_backlog_qs.count()

        velocity = compute_velocity_projection(
            remaining_work=remaining_work,
            velocities=velocities,
            avg_cycle_duration_days=avg_cycle_duration_days,
        )

        return Response(
            {
                "estimate_type": estimate_type,
                # Frontend guard for exigence 8: when cycles are disabled
                # for the project, the velocity/ETA section is hidden and
                # only the pre-existing all-issues created-vs-resolved
                # chart (`ProjectAdvanceAnalyticsChartEndpoint`) stays.
                "cycles_enabled": project.cycle_view,
                "velocity_window_size": window_size,
                "cycles": cycles_payload,
                "velocity": velocity,
            },
            status=status.HTTP_200_OK,
        )
