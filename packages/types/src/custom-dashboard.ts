/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Types for the custom cross-project dashboard builder - see
 * docs/feature-specs/05-insights-analytics.md, section 3 ("Constructeur de
 * dashboards personnalises + liens partageables").
 *
 * Deliberately named `custom-dashboard.ts` (not `dashboard.ts`, already
 * taken by the legacy per-user home-page-widget system's
 * `TDeprecatedDashboard`/`TWidget` types in this same directory) to avoid
 * any confusion between the two, unrelated systems.
 */

import type { TIssuePriorities } from "./issues";
import type { IIssueLabel } from "./issues";
import type { TLogoProps } from "./common";
import type { TPaginatedResponse } from "./pagination";
import type { IProjectLite } from "./project";
import type { IStateLite } from "./state";
import type { IUserLite } from "./users";

export type TDashboardWidgetType = "chart" | "kpi" | "table";

// ============================================================================
// Widget config - shape depends on `widget_type`, see
// `plane.utils.dashboard_widget` on the backend for the authoritative list.
// ============================================================================

/** Valid `x_axis`/`segment` field values - mirrors the backend's
 * `VALID_ANALYTICS_FIELDS` (`plane/utils/analytics_plot.py`). */
export type TDashboardChartAxisField =
  | "state_id"
  | "state__group"
  | "labels__id"
  | "assignees__id"
  | "estimate_point__value"
  | "issue_cycle__cycle_id"
  | "issue_module__module_id"
  | "priority"
  | "start_date"
  | "target_date"
  | "created_at"
  | "completed_at";

/** Valid `y_axis` field values - mirrors the backend's `VALID_YAXIS`. */
export type TDashboardChartYAxisField = "issue_count" | "estimate";

export type TDashboardWidgetChartConfig = {
  x_axis: TDashboardChartAxisField;
  y_axis: TDashboardChartYAxisField;
  /** Must differ from `x_axis` - the backend silently drops the segment
   * (falls back to no segment) if it's equal to `x_axis` or invalid, so the
   * UI should validate this itself for a good UX, but isn't required to. */
  segment?: TDashboardChartAxisField | null;
};

export type TDashboardKpiMetric = "total_open_issues" | "completion_rate" | "overdue_issues" | "total_issues";

export type TDashboardWidgetKpiConfig = {
  metric: TDashboardKpiMetric;
};

export type TDashboardTableDueDateFilter = "overdue" | "due_today" | "no_due_date";

export type TDashboardWidgetTableConfig = {
  state_ids?: string[];
  assignee_ids?: string[];
  label_ids?: string[];
  priority?: TIssuePriorities[];
  due_date_filter?: TDashboardTableDueDateFilter;
};

export type TDashboardWidgetConfig =
  | TDashboardWidgetChartConfig
  | TDashboardWidgetKpiConfig
  | TDashboardWidgetTableConfig;

// ============================================================================
// Widget - matches react-grid-layout's own item shape directly (x/y/w/h grid
// units), see `plane.db.models.dashboard.get_default_widget_position`.
// ============================================================================

export type TDashboardWidgetPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type TDashboardWidgetBase = {
  id: string;
  workspace: string;
  project: string | null;
  dashboard: string;
  title: string;
  project_ids: string[];
  position: TDashboardWidgetPosition;
  sort_order: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Discriminated union on `widget_type` so `config` narrows automatically. */
export type TDashboardWidget =
  | (TDashboardWidgetBase & { widget_type: "chart"; config: TDashboardWidgetChartConfig })
  | (TDashboardWidgetBase & { widget_type: "kpi"; config: TDashboardWidgetKpiConfig })
  | (TDashboardWidgetBase & { widget_type: "table"; config: TDashboardWidgetTableConfig });

export type TDashboardWidgetCreatePayload = {
  widget_type: TDashboardWidgetType;
  title: string;
  config: TDashboardWidgetConfig;
  project_ids: string[];
  /** Optional - the backend defaults to `{x:0,y:0,w:4,h:3}` when omitted. */
  position?: TDashboardWidgetPosition;
};

export type TDashboardWidgetUpdatePayload = Partial<TDashboardWidgetCreatePayload>;

export type TDashboardWidgetReorderItem = {
  id: string;
  position?: TDashboardWidgetPosition;
  sort_order?: number;
};

export type TDashboardWidgetReorderPayload = {
  widgets: TDashboardWidgetReorderItem[];
};

// ============================================================================
// Dashboard
// ============================================================================

export type TDashboard = {
  id: string;
  workspace: string;
  project: string | null;
  name: string;
  description: string;
  logo_props: TLogoProps;
  owned_by: string;
  owned_by_detail: IUserLite;
  /** `null` if never published - see `TDashboardPublishSettings`. */
  anchor: string | null;
  is_published: boolean;
  /** Already ordered by (sort_order, created_at) by the backend. */
  widgets: TDashboardWidget[];
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TDashboardCreatePayload = {
  name: string;
  description?: string;
  logo_props?: TLogoProps;
};

export type TDashboardUpdatePayload = Partial<TDashboardCreatePayload>;

// ============================================================================
// Publish (share link)
// ============================================================================

export type TDashboardPublishSettings = {
  anchor: string;
  is_published: boolean;
};

// ============================================================================
// Widget data - computed values, see `GET .../widgets/<id>/data/` and the
// public equivalent. Distinct from the widget's own config/layout above.
// ============================================================================

export type TDashboardWidgetChartData = {
  widget_type: "chart";
  x_axis: TDashboardChartAxisField;
  y_axis: TDashboardChartYAxisField;
  segment: TDashboardChartAxisField | null;
  total: number;
  /**
   * Opaque/dynamic shape straight from the pre-existing `build_graph_plot`
   * analytics engine - keyed by the x_axis dimension value, each entry
   * either a flat count/estimate or (when `segment` is set) a per-segment
   * breakdown. Consumers should iterate `Object.entries(distribution)`
   * rather than assume a fixed inner shape (same engine the legacy
   * single-project "Work Items Analysis" charts already consume).
   */
  distribution: Record<string, unknown>;
};

export type TDashboardWidgetKpiData = {
  widget_type: "kpi";
  metric: TDashboardKpiMetric;
  /** A percentage (0-100, rounded to 2 decimals) for `completion_rate`,
   * otherwise a plain integer count. */
  value: number;
};

export type TDashboardWidgetTableRow = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project_detail: IProjectLite;
  state_id: string;
  state_detail: IStateLite;
  priority: TIssuePriorities;
  assignee_details: IUserLite[];
  label_details: Pick<IIssueLabel, "id" | "name" | "color">[];
  target_date: string | null;
  created_at: string;
};

/** The standard paginated envelope used everywhere else in this codebase -
 * no `widget_type` discriminant on the wire (unlike chart/kpi), so callers
 * should rely on the *widget's own* `widget_type` (already known statically
 * wherever a widget is rendered) rather than trying to narrow this at
 * runtime. */
export type TDashboardWidgetTableData = TPaginatedResponse<TDashboardWidgetTableRow[]>;

export type TDashboardWidgetData = TDashboardWidgetChartData | TDashboardWidgetKpiData | TDashboardWidgetTableData;

// ============================================================================
// Public (unauthenticated, `apps/space`) shapes - config/layout only, never
// computed data - see `plane.space.serializer.dashboard`.
// ============================================================================

export type TPublicDashboardWidget = Pick<
  TDashboardWidgetBase,
  "id" | "title" | "project_ids" | "position" | "sort_order"
> &
  (
    | { widget_type: "chart"; config: TDashboardWidgetChartConfig }
    | { widget_type: "kpi"; config: TDashboardWidgetKpiConfig }
    | { widget_type: "table"; config: TDashboardWidgetTableConfig }
  );

export type TPublicDashboard = {
  id: string;
  name: string;
  description: string;
  logo_props: TLogoProps;
  widgets: TPublicDashboardWidget[];
  created_at: string;
  updated_at: string;
};
