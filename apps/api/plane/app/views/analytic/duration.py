# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Cross-workspace lead time / cycle time / triage time percentile
distributions (p50/p75/p90) - see docs/feature-specs/05-insights-analytics.md,
section 2.

Definitions:
- Lead time = `Issue.completed_at - Issue.created_at`, completed issues only.
- Cycle time = `Issue.completed_at - started_at`, where `started_at` is the
  first time the issue's state entered a "started"-group state, derived
  query-time from `IssueActivity` (no stored field - see
  `plane/db/models/issue.py::IssueActivity.Meta.indexes` for the composite
  index backing this subquery). Issues with no recorded "started" transition
  are excluded from this percentile set entirely - never fabricated.
- Triage time = `IntakeIssue.triaged_at - IntakeIssue.created_at`, only for
  intake issues that have actually been triaged (`triaged_at__isnull=False`).

Guest role is deliberately excluded from this endpoint, matching the rest of
the pre-existing `AdvanceAnalytics*` family it lives alongside.
"""

from typing import Any, Dict, Optional

from django.db.models import DateTimeField, DurationField, ExpressionWrapper, F, FloatField, OuterRef, Subquery, Count
from django.db.models.functions import Extract
from django.http import HttpRequest
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import IntakeIssue, Issue, IssueActivity, State
from plane.utils.cache import cache_response
from plane.utils.percentiles import PercentileCont

from .advance import AdvanceAnalyticsBaseView

SECONDS_PER_DAY = 60 * 60 * 24


def _duration_seconds_expr(end_field: str, start_field: str) -> Extract:
    """`end_field - start_field`, as a float number of seconds."""
    duration = ExpressionWrapper(F(end_field) - F(start_field), output_field=DurationField())
    return Extract(duration, "epoch", output_field=FloatField())


def _percentile_days(value_seconds: Optional[float]) -> Optional[float]:
    if value_seconds is None:
        return None
    return round(value_seconds / SECONDS_PER_DAY, 2)


def _aggregate_percentiles(queryset, duration_field: str) -> Dict[str, Any]:
    aggregates = queryset.aggregate(
        p50=PercentileCont(duration_field, percentile=0.5),
        p75=PercentileCont(duration_field, percentile=0.75),
        p90=PercentileCont(duration_field, percentile=0.9),
        sample_size=Count("id"),
    )
    sample_size = aggregates["sample_size"] or 0
    # If there's no sample, every percentile must be null - never 0 or a
    # fabricated value.
    if not sample_size:
        return {"p50": None, "p75": None, "p90": None, "sample_size": 0}
    return {
        "p50": _percentile_days(aggregates["p50"]),
        "p75": _percentile_days(aggregates["p75"]),
        "p90": _percentile_days(aggregates["p90"]),
        "sample_size": sample_size,
    }


class AdvanceAnalyticsDurationEndpoint(AdvanceAnalyticsBaseView):
    def get_lead_time(self) -> Dict[str, Any]:
        # Only completed issues have a resolved lead time.
        queryset = (
            Issue.issue_objects.filter(**self.filters["base_filters"], completed_at__isnull=False)
            .annotate(lead_duration_seconds=_duration_seconds_expr("completed_at", "created_at"))
        )
        return _aggregate_percentiles(queryset, "lead_duration_seconds")

    def get_cycle_time(self) -> Dict[str, Any]:
        started_state_ids = State.objects.filter(group="started").values_list("id", flat=True)
        # First time this issue's state entered a "started"-group state -
        # derived query-time, no stored field (see module docstring).
        started_at_subquery = Subquery(
            IssueActivity.objects.filter(
                issue_id=OuterRef("pk"), field="state", new_identifier__in=started_state_ids
            )
            .order_by("created_at")
            .values("created_at")[:1],
            output_field=DateTimeField(),
        )
        queryset = (
            Issue.issue_objects.filter(**self.filters["base_filters"], completed_at__isnull=False)
            .annotate(started_at=started_at_subquery)
            # An issue with no "started" transition on record has no cycle
            # time - excluded from the percentile set, not fabricated.
            .filter(started_at__isnull=False)
            .annotate(cycle_duration_seconds=_duration_seconds_expr("completed_at", "started_at"))
        )
        return _aggregate_percentiles(queryset, "cycle_duration_seconds")

    def get_triage_time(self) -> Dict[str, Any]:
        # Only intake issues that have actually been triaged at least once.
        queryset = IntakeIssue.objects.filter(**self.filters["base_filters"], triaged_at__isnull=False).annotate(
            triage_duration_seconds=_duration_seconds_expr("triaged_at", "created_at")
        )
        return _aggregate_percentiles(queryset, "triage_duration_seconds")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    @cache_response(timeout=60 * 15)
    def get(self, request: HttpRequest, slug: str) -> Response:
        self.initialize_workspace(slug, type="analytics")
        return Response(
            {
                "lead_time": self.get_lead_time(),
                "cycle_time": self.get_cycle_time(),
                "triage_time": self.get_triage_time(),
            },
            status=status.HTTP_200_OK,
        )
