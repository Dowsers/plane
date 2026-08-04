# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models

# Module imports
from .workspace import WorkspaceBaseModel


def get_default_widget_position():
    """Matches react-grid-layout's own item shape directly (x/y/w/h grid
    units) - see docs/feature-specs/05-insights-analytics.md, section 3,
    exigence 8. The frontend consumes/persists this shape as-is."""
    return {"x": 0, "y": 0, "w": 4, "h": 3}


class Dashboard(WorkspaceBaseModel):
    """A workspace-scoped custom dashboard made up of an ordered list of
    `DashboardWidget`s - see docs/feature-specs/05-insights-analytics.md,
    section 3 ("Constructeur de dashboards personnalises + liens
    partageables"), exigence 1.

    Deliberately cross-project: `WorkspaceBaseModel.project` is left null
    (same shape `DeployBoard` already uses for cross-project entities) -
    each individual widget carries its own `project_ids` instead.

    `owned_by` is set equal to `created_by` at creation time (see the
    dashboard views) and there is no ownership-transfer endpoint in this
    v1, so the two always agree on every dashboard that exists today. The
    field is still modeled independently (rather than just aliasing
    `created_by`) so a future "transfer ownership" action doesn't require
    a schema change - it's a plain FK update at that point.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    logo_props = models.JSONField(default=dict)
    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_dashboards",
    )

    class Meta:
        verbose_name = "Dashboard"
        verbose_name_plural = "Dashboards"
        db_table = "dashboards"
        ordering = ("-created_at",)

    def __str__(self):
        return str(self.name)


class DashboardWidget(WorkspaceBaseModel):
    """A single widget on a `Dashboard` - chart/kpi/table - see
    docs/feature-specs/05-insights-analytics.md, section 3, exigences 3-8.

    `project_ids` is a plain array of ids (not FKs), deliberately - a
    deleted/archived/no-longer-accessible project just silently drops out
    of the aggregation filters at query time (see
    `plane.utils.date_utils.get_analytics_filters`/
    `get_public_analytics_filters`), so there is no separate "orphaned
    widget" state to track (exigence 15): the widget itself is never
    touched when a source project disappears, only its computed data for
    that project stops appearing.
    """

    class WidgetType(models.TextChoices):
        CHART = "chart", "Chart"
        KPI = "kpi", "KPI"
        TABLE = "table", "Table"

    dashboard = models.ForeignKey(Dashboard, on_delete=models.CASCADE, related_name="widgets")
    widget_type = models.CharField(max_length=20, choices=WidgetType.choices)
    title = models.CharField(max_length=255)
    # Shape depends on widget_type - see the widget serializer/view module
    # docstrings for the exact per-type shape (x_axis/y_axis/segment for
    # chart, metric for kpi, state_ids/assignee_ids/label_ids/priority/
    # due_date_filter for table).
    config = models.JSONField(default=dict)
    project_ids = ArrayField(models.UUIDField(), default=list, blank=True)
    position = models.JSONField(default=get_default_widget_position)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Dashboard Widget"
        verbose_name_plural = "Dashboard Widgets"
        db_table = "dashboard_widgets"
        ordering = ("sort_order", "created_at")

    def save(self, *args, **kwargs):
        if self._state.adding:
            largest_sort_order = DashboardWidget.objects.filter(dashboard=self.dashboard).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if largest_sort_order is not None:
                self.sort_order = largest_sort_order + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} <{self.dashboard_id}>"
