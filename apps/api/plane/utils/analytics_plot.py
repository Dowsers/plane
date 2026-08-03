# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import timedelta
from itertools import groupby

import pytz

# Django import
from django.db import models
from django.db.models import Case, CharField, Count, F, Sum, Value, When, FloatField
from django.db.models.functions import (
    Coalesce,
    Concat,
    ExtractMonth,
    ExtractYear,
    TruncDate,
    Cast,
)
from django.utils import timezone

# Module imports
from plane.db.models import CycleIssue, Issue, Project

VALID_ANALYTICS_FIELDS = [
    "state_id",
    "state__group",
    "labels__id",
    "assignees__id",
    "estimate_point__value",
    "issue_cycle__cycle_id",
    "issue_module__module_id",
    "priority",
    "start_date",
    "target_date",
    "created_at",
    "completed_at",
]

VALID_YAXIS = ["issue_count", "estimate"]


def annotate_with_monthly_dimension(queryset, field_name, attribute):
    # Get the year and the months
    year = ExtractYear(field_name)
    month = ExtractMonth(field_name)
    # Concat the year and month
    dimension = Concat(year, Value("-"), month, output_field=CharField())
    # Annotate the dimension
    return queryset.annotate(**{attribute: dimension})


def extract_axis(queryset, x_axis):
    if x_axis not in VALID_ANALYTICS_FIELDS:
        raise ValueError(f"Invalid x_axis value: {x_axis}")
    # Format the dimension when the axis is in date
    if x_axis in ["created_at", "start_date", "target_date", "completed_at"]:
        queryset = annotate_with_monthly_dimension(queryset, x_axis, "dimension")
        return queryset, "dimension"
    else:
        return queryset.annotate(dimension=F(x_axis)), "dimension"


def sort_data(data, temp_axis):
    # When the axis is in priority order by
    if temp_axis == "priority":
        order = ["low", "medium", "high", "urgent", "none"]
        return {key: data[key] for key in order if key in data}
    else:
        return dict(sorted(data.items(), key=lambda x: (x[0] == "none", x[0])))


def build_graph_plot(queryset, x_axis, y_axis, segment=None):
    if x_axis not in VALID_ANALYTICS_FIELDS:
        raise ValueError(f"Invalid x_axis value: {x_axis}")
    if y_axis not in VALID_YAXIS:
        raise ValueError(f"Invalid y_axis value: {y_axis}")
    if segment and segment not in VALID_ANALYTICS_FIELDS:
        raise ValueError(f"Invalid segment value: {segment}")

    # temp x_axis
    temp_axis = x_axis
    # Extract the x_axis and queryset
    queryset, x_axis = extract_axis(queryset, x_axis)
    if x_axis == "dimension":
        queryset = queryset.exclude(dimension__isnull=True)

    #
    if segment in ["created_at", "start_date", "target_date", "completed_at"]:
        queryset = annotate_with_monthly_dimension(queryset, segment, "segmented")
        segment = "segmented"

    queryset = queryset.values(x_axis)

    # Issue count
    if y_axis == "issue_count":
        queryset = queryset.annotate(
            is_null=Case(
                When(dimension__isnull=True, then=Value("None")),
                default=Value("not_null"),
                output_field=models.CharField(max_length=8),
            ),
            dimension_ex=Coalesce("dimension", Value("null")),
        ).values("dimension")
        queryset = queryset.annotate(segment=F(segment)) if segment else queryset
        queryset = queryset.values("dimension", "segment") if segment else queryset.values("dimension")
        queryset = queryset.annotate(count=Count("*")).order_by("dimension")

    # Estimate
    else:
        queryset = queryset.annotate(estimate=Sum(Cast("estimate_point__value", FloatField()))).order_by(x_axis)
        queryset = queryset.annotate(segment=F(segment)) if segment else queryset
        queryset = (
            queryset.values("dimension", "segment", "estimate") if segment else queryset.values("dimension", "estimate")
        )

    result_values = list(queryset)
    grouped_data = {str(key): list(items) for key, items in groupby(result_values, key=lambda x: x[str("dimension")])}

    return sort_data(grouped_data, temp_axis)


def burndown_plot(queryset, slug, project_id, plot_type, cycle_id=None, module_id=None):
    # Total Issues in Cycle or Module
    total_issues = queryset.total_issues
    # check whether the estimate is a point or not
    estimate_type = Project.objects.filter(
        workspace__slug=slug,
        pk=project_id,
        estimate__isnull=False,
        estimate__type="points",
    ).exists()
    if estimate_type and plot_type == "points" and cycle_id:
        issue_estimates = Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            issue_cycle__cycle_id=cycle_id,
            issue_cycle__deleted_at__isnull=True,
            estimate_point__isnull=False,
        ).values_list("estimate_point__value", flat=True)

        issue_estimates = [float(value) for value in issue_estimates]
        total_estimate_points = sum(issue_estimates)

    if estimate_type and plot_type == "points" and module_id:
        issue_estimates = Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            issue_module__module_id=module_id,
            issue_module__deleted_at__isnull=True,
            estimate_point__isnull=False,
        ).values_list("estimate_point__value", flat=True)

        issue_estimates = [float(value) for value in issue_estimates]
        total_estimate_points = sum(issue_estimates)

    if cycle_id:
        if queryset.end_date and queryset.start_date:
            # Get all dates between the two dates
            date_range = [
                (queryset.start_date + timedelta(days=x)).date()
                for x in range((queryset.end_date.date() - queryset.start_date.date()).days + 1)
            ]
        else:
            date_range = []

        chart_data = {str(date): 0 for date in date_range}

        if plot_type == "points":
            completed_issues_estimate_point_distribution = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    issue_cycle__cycle_id=cycle_id,
                    issue_cycle__deleted_at__isnull=True,
                    estimate_point__isnull=False,
                )
                .annotate(date=TruncDate("completed_at"))
                .values("date")
                .values("date", "estimate_point__value")
                .order_by("date")
            )
        else:
            completed_issues_distribution = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    issue_cycle__cycle_id=cycle_id,
                    issue_cycle__deleted_at__isnull=True,
                )
                .annotate(date=TruncDate("completed_at"))
                .values("date")
                .annotate(total_completed=Count("id"))
                .values("date", "total_completed")
                .order_by("date")
            )

    if module_id:
        # Get all dates between the two dates
        date_range = [
            (queryset.start_date + timedelta(days=x))
            for x in range((queryset.target_date - queryset.start_date).days + 1)
        ]

        chart_data = {str(date): 0 for date in date_range}

        if plot_type == "points":
            completed_issues_estimate_point_distribution = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    issue_module__module_id=module_id,
                    issue_module__deleted_at__isnull=True,
                    estimate_point__isnull=False,
                )
                .annotate(date=TruncDate("completed_at"))
                .values("date")
                .values("date", "estimate_point__value")
                .order_by("date")
            )
        else:
            completed_issues_distribution = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    issue_module__module_id=module_id,
                    issue_module__deleted_at__isnull=True,
                )
                .annotate(date=TruncDate("completed_at"))
                .values("date")
                .annotate(total_completed=Count("id"))
                .values("date", "total_completed")
                .order_by("date")
            )

    if plot_type == "points":
        for date in date_range:
            cumulative_pending_issues = total_estimate_points
            total_completed = 0
            total_completed = sum(
                float(item["estimate_point__value"])
                for item in completed_issues_estimate_point_distribution
                if item["date"] is not None and item["date"] <= date
            )
            cumulative_pending_issues -= total_completed
            if date > timezone.now().date():
                chart_data[str(date)] = None
            else:
                chart_data[str(date)] = cumulative_pending_issues
    else:
        for date in date_range:
            cumulative_pending_issues = total_issues
            total_completed = 0
            total_completed = sum(
                item["total_completed"]
                for item in completed_issues_distribution
                if item["date"] is not None and item["date"] <= date
            )
            cumulative_pending_issues -= total_completed
            if date > timezone.now().date():
                chart_data[str(date)] = None
            else:
                chart_data[str(date)] = cumulative_pending_issues

    return chart_data


def cycle_progress_counts(slug, project_id, cycle_id):
    """
    Backlog/unstarted/started/cancelled/completed/total counts for a single
    cycle - issues *and* estimate points. This is the exact aggregation
    `CycleProgressEndpoint` returns for a single cycle, factored out so the
    project-level "Scope & velocity" endpoint (`ProjectProgressEndpoint`)
    can reuse the identical counting logic per-cycle instead of
    re-deriving its own query style - see
    docs/feature-specs/05-insights-analytics.md, section 1.
    """
    aggregate_estimates = (
        Issue.issue_objects.filter(
            estimate_point__estimate__type="points",
            issue_cycle__cycle_id=cycle_id,
            issue_cycle__deleted_at__isnull=True,
            workspace__slug=slug,
            project_id=project_id,
        )
        .annotate(value_as_float=Cast("estimate_point__value", FloatField()))
        .aggregate(
            backlog_estimate_point=Sum(
                Case(
                    When(state__group="backlog", then="value_as_float"),
                    default=Value(0),
                    output_field=FloatField(),
                )
            ),
            unstarted_estimate_point=Sum(
                Case(
                    When(state__group="unstarted", then="value_as_float"),
                    default=Value(0),
                    output_field=FloatField(),
                )
            ),
            started_estimate_point=Sum(
                Case(
                    When(state__group="started", then="value_as_float"),
                    default=Value(0),
                    output_field=FloatField(),
                )
            ),
            cancelled_estimate_point=Sum(
                Case(
                    When(state__group="cancelled", then="value_as_float"),
                    default=Value(0),
                    output_field=FloatField(),
                )
            ),
            completed_estimate_points=Sum(
                Case(
                    When(state__group="completed", then="value_as_float"),
                    default=Value(0),
                    output_field=FloatField(),
                )
            ),
            total_estimate_points=Sum("value_as_float", default=Value(0), output_field=FloatField()),
        )
    )

    base_issue_qs = Issue.issue_objects.filter(
        issue_cycle__cycle_id=cycle_id,
        issue_cycle__deleted_at__isnull=True,
        workspace__slug=slug,
        project_id=project_id,
    )

    return {
        "backlog_estimate_points": aggregate_estimates["backlog_estimate_point"] or 0,
        "unstarted_estimate_points": aggregate_estimates["unstarted_estimate_point"] or 0,
        "started_estimate_points": aggregate_estimates["started_estimate_point"] or 0,
        "cancelled_estimate_points": aggregate_estimates["cancelled_estimate_point"] or 0,
        "completed_estimate_points": aggregate_estimates["completed_estimate_points"] or 0,
        "total_estimate_points": aggregate_estimates["total_estimate_points"],
        "backlog_issues": base_issue_qs.filter(state__group="backlog").count(),
        "unstarted_issues": base_issue_qs.filter(state__group="unstarted").count(),
        "started_issues": base_issue_qs.filter(state__group="started").count(),
        "cancelled_issues": base_issue_qs.filter(state__group="cancelled").count(),
        "completed_issues": base_issue_qs.filter(state__group="completed").count(),
        "total_issues": base_issue_qs.count(),
    }


def _cycle_day_range(cycle):
    """
    List of local calendar dates (in the cycle's own `Cycle.timezone`,
    which is more specific than `Workspace.timezone`) spanned by the
    cycle, inclusive of both `start_date` and `end_date` - see
    docs/feature-specs/05-insights-analytics.md, exigence 12 (fuseau
    horaire). `Cycle.timezone` already exists and is already used for the
    cycle's manual start/stop feature, so this reuses it rather than
    introducing a new timezone source.
    """
    if not (cycle.start_date and cycle.end_date):
        return []
    tz = pytz.timezone(cycle.timezone or "UTC")
    start = cycle.start_date.astimezone(tz).date()
    end = cycle.end_date.astimezone(tz).date()
    return [start + timedelta(days=x) for x in range((end - start).days + 1)]


def cycle_scope_plot(cycle, slug, project_id, cycle_id, plot_type="issues"):
    """
    Real day-by-day scope line for the cycle burndown/burn-up chart - see
    docs/feature-specs/05-insights-analytics.md, section 1, exigence 2
    ("Ligne de scope": "valeur cumulee du travail total assigne au cycle a
    chaque jour"). Unlike `burndown_plot`'s baseline (a *constant*
    `total_issues`, i.e. today's current total repeated on every day),
    this reflects the actual historical net scope: an issue counts as
    in-scope on day D if it was added to the cycle on/before D, and either
    was never removed or was only removed after D.

    No bespoke add/remove-timestamp columns are needed for this -
    `CycleIssue` is a plain soft-deleted pivot (see plane/db/mixins.py,
    `SoftDeleteModel`) and `CycleIssueViewSet.destroy()` does a plain
    `.delete()` with no `soft=False` override, so `created_at`
    (add timestamp) and `deleted_at` (remove timestamp, only populated once
    soft-deleted) already give an exact historical record.
    `CycleIssue.all_objects` bypasses the default `deleted_at__isnull=True`
    filter so removed rows are visible too.

    Deliberately NOT computed here: a day-by-day "started" series. A real
    historical "started" line is possible (via `IssueActivity` rows with
    `field="state"`, resolving `old_identifier`/`new_identifier` to their
    `State.group`) but is meaningfully more work for a v1 (one extra
    join/index). v1 ships "started" as a today-only snapshot, matching
    `CycleProgressEndpoint`'s existing (non-historical) behaviour - see the
    05-insights-analytics patch notes for this explicit scope decision.
    """
    date_range = _cycle_day_range(cycle)
    if not date_range:
        return {}

    tz = pytz.timezone(cycle.timezone or "UTC")

    def _local_date(dt):
        return dt.astimezone(tz).date() if dt else None

    # Every cycle<->issue link that ever existed for this cycle, regardless
    # of its current soft-delete state.
    cycle_issue_rows = list(
        CycleIssue.all_objects.filter(
            cycle_id=cycle_id,
            project_id=project_id,
            workspace__slug=slug,
        ).values("issue_id", "created_at", "deleted_at")
    )
    issue_ids = [row["issue_id"] for row in cycle_issue_rows]

    if plot_type == "points":
        weight_by_issue_id = {
            issue_id: float(value)
            for issue_id, value in Issue.issue_objects.filter(
                id__in=issue_ids, estimate_point__isnull=False
            ).values_list("id", "estimate_point__value")
        }
    else:
        # Archived/draft/(hard-)deleted issues never count towards scope
        # (exigence 10) - `issue_objects` already excludes them, same as
        # every other issue-counting query in this module.
        weight_by_issue_id = dict.fromkeys(
            Issue.issue_objects.filter(id__in=issue_ids).values_list("id", flat=True), 1
        )

    windows = [
        (_local_date(row["created_at"]), _local_date(row["deleted_at"]), row["issue_id"]) for row in cycle_issue_rows
    ]

    scope_chart = {}
    for day in date_range:
        total = 0.0
        for added_date, removed_date, issue_id in windows:
            if added_date is None or added_date > day:
                continue
            if removed_date is not None and removed_date <= day:
                continue
            total += weight_by_issue_id.get(issue_id, 0) or 0
        scope_chart[str(day)] = total if plot_type == "points" else int(total)

    return scope_chart
