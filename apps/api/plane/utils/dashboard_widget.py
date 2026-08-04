# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared widget-data computation for `DashboardWidget` - see
docs/feature-specs/05-insights-analytics.md, section 3
("Constructeur de dashboards personnalises + liens partageables"),
exigences 4-6.

Used identically by both the authenticated widget-data endpoint
(`plane.app.views.dashboard.data`, filters built by
`plane.utils.date_utils.get_analytics_filters`) and the public/anonymous
one (`plane.space.views.dashboard`, filters built by
`get_public_analytics_filters`) - the only difference between the two
callers is which filter helper produced `filters`, never this module. Both
helpers already intersect `project_id__in` with the widget's own
`project_ids` and drop projects the caller can't/shouldn't see, so
"fusion des resultats" (exigence 4) and the silent per-viewer project
exclusion (exigence 3) fall out of the queryset itself - nothing here is
aware of who's asking.
"""

# Python imports
from typing import Any, Dict, Optional

# Django imports
from django.db.models import QuerySet
from django.utils import timezone

# Module imports
from plane.db.models import Issue
from plane.utils.analytics_plot import VALID_ANALYTICS_FIELDS, VALID_YAXIS, build_graph_plot

DEFAULT_CHART_X_AXIS = "state_id"
DEFAULT_CHART_Y_AXIS = "issue_count"

OPEN_STATE_GROUPS = ["backlog", "unstarted", "started"]

# The "at least 3" KPI metrics required by exigence 5, plus one trivial
# extra (`total_issues`) - see `compute_kpi_widget_data`.
KPI_METRICS = ["total_open_issues", "completion_rate", "overdue_issues", "total_issues"]

# Valid values for the table widget's `config.due_date_filter`.
DUE_DATE_FILTERS = ["overdue", "due_today", "no_due_date"]


def _base_issue_queryset(filters: Dict[str, Any]) -> QuerySet:
    return Issue.issue_objects.filter(**filters["base_filters"])


def compute_chart_widget_data(widget, filters: Dict[str, Any]) -> Dict[str, Any]:
    """`chart` widget type (exigence 4) - reuses the exact multi-dimension
    aggregation engine the legacy single-project "Work Items Analysis"
    already uses (`build_graph_plot`), fed a queryset pre-filtered to the
    widget's own (possibly multi-project) `project_ids` instead of a
    single project."""
    config = widget.config or {}
    x_axis = config.get("x_axis") or DEFAULT_CHART_X_AXIS
    y_axis = config.get("y_axis") or DEFAULT_CHART_Y_AXIS
    segment = config.get("segment") or None

    if x_axis not in VALID_ANALYTICS_FIELDS:
        x_axis = DEFAULT_CHART_X_AXIS
    if y_axis not in VALID_YAXIS:
        y_axis = DEFAULT_CHART_Y_AXIS
    if segment and (segment not in VALID_ANALYTICS_FIELDS or segment == x_axis):
        segment = None

    queryset = _base_issue_queryset(filters)
    total = queryset.count()
    distribution = build_graph_plot(queryset=queryset, x_axis=x_axis, y_axis=y_axis, segment=segment)

    return {
        "widget_type": "chart",
        "x_axis": x_axis,
        "y_axis": y_axis,
        "segment": segment,
        "total": total,
        "distribution": distribution,
    }


def compute_kpi_widget_data(widget, filters: Dict[str, Any]) -> Dict[str, Any]:
    """`kpi` widget type (exigence 5) - a single aggregated number computed
    cross-project at request time (no caching/materialization)."""
    config = widget.config or {}
    metric = config.get("metric")
    if metric not in KPI_METRICS:
        metric = KPI_METRICS[0]

    base_queryset = _base_issue_queryset(filters)
    value: Optional[float]

    if metric == "total_open_issues":
        value = base_queryset.filter(state__group__in=OPEN_STATE_GROUPS).count()
    elif metric == "completion_rate":
        total = base_queryset.count()
        completed = base_queryset.filter(state__group="completed").count()
        value = round((completed / total) * 100, 2) if total else 0.0
    elif metric == "overdue_issues":
        value = base_queryset.filter(
            target_date__lt=timezone.now().date(), state__group__in=OPEN_STATE_GROUPS
        ).count()
    else:  # total_issues
        value = base_queryset.count()

    return {"widget_type": "kpi", "metric": metric, "value": value}


def build_table_widget_queryset(widget, filters: Dict[str, Any]) -> QuerySet:
    """`table` widget type (exigence 6) - filtered/paginated issue list.
    Returns a queryset only; pagination itself is done by the calling view
    via `BasePaginator.paginate` so the response envelope matches every
    other paginated list endpoint in this codebase."""
    config = widget.config or {}
    queryset = (
        _base_issue_queryset(filters)
        .select_related("project", "state")
        .prefetch_related("assignees", "labels")
    )

    if config.get("state_ids"):
        queryset = queryset.filter(state_id__in=config["state_ids"])
    if config.get("assignee_ids"):
        queryset = queryset.filter(assignees__id__in=config["assignee_ids"])
    if config.get("label_ids"):
        queryset = queryset.filter(labels__id__in=config["label_ids"])
    if config.get("priority"):
        queryset = queryset.filter(priority__in=config["priority"])

    due_date_filter = config.get("due_date_filter")
    if due_date_filter == "overdue":
        queryset = queryset.filter(target_date__lt=timezone.now().date())
    elif due_date_filter == "due_today":
        queryset = queryset.filter(target_date=timezone.now().date())
    elif due_date_filter == "no_due_date":
        queryset = queryset.filter(target_date__isnull=True)

    return queryset.distinct().order_by("-created_at")


def compute_widget_data(widget, filters: Dict[str, Any]):
    """Dispatch on `widget.widget_type`. Returns a dict for chart/kpi, or a
    `QuerySet` (still needing pagination) for table."""
    if widget.widget_type == "chart":
        return compute_chart_widget_data(widget, filters)
    if widget.widget_type == "kpi":
        return compute_kpi_widget_data(widget, filters)
    if widget.widget_type == "table":
        return build_table_widget_queryset(widget, filters)
    raise ValueError(f"Unsupported widget type: {widget.widget_type}")
