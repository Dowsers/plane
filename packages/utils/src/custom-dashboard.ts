/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Shared parsing helpers for the custom cross-project dashboard builder's
 * `chart` widget type - see docs/feature-specs/05-insights-analytics.md,
 * section 3. Lives in `@plane/utils` (rather than duplicated inside
 * `apps/web` and `apps/space` separately) so both the authenticated editor
 * and the public read-only viewer render the exact same distribution shape
 * identically.
 */

/** A single parsed row, ready to hand to a bar chart. `segments` is `null`
 * when the widget has no `segment` configured. */
export type TDashboardChartDatum = {
  /** The raw x_axis dimension value (e.g. a state id, a priority key). */
  key: string;
  /** Sum of every row's value for this dimension - the un-segmented total. */
  total: number;
  /** Per-segment breakdown, keyed by the segment's raw value - `null` if
   * the widget has no `segment` configured. */
  segments: Record<string, number> | null;
};

/**
 * `TDashboardWidgetChartData.distribution` is deliberately opaque/dynamic -
 * it comes straight from the pre-existing `build_graph_plot` engine, whose
 * per-key value is either a plain number, or a list of `{count|estimate,
 * segment?}` rows (one row per segment value when `segment` is set, a
 * single row otherwise). This parses either shape defensively into a flat,
 * chart-ready array without assuming which one it got.
 */
export function parseDashboardChartDistribution(
  distribution: Record<string, unknown> | null | undefined,
  yAxisField: "issue_count" | "estimate"
): TDashboardChartDatum[] {
  if (!distribution) return [];
  const valueKey = yAxisField === "estimate" ? "estimate" : "count";

  return Object.entries(distribution).map(([key, rawValue]) => {
    const rows = Array.isArray(rawValue) ? rawValue : [rawValue];
    let total = 0;
    let segments: Record<string, number> | null = null;

    rows.forEach((row) => {
      if (row === null || row === undefined) return;
      if (typeof row === "number") {
        total += row;
        return;
      }
      if (typeof row === "object") {
        const record = row as Record<string, unknown>;
        const value = Number(record[valueKey] ?? 0) || 0;
        const segmentKey = record.segment;
        if (segmentKey !== undefined && segmentKey !== null && segmentKey !== "") {
          segments = segments ?? {};
          const segmentLabel = String(segmentKey);
          segments[segmentLabel] = (segments[segmentLabel] ?? 0) + value;
        }
        total += value;
      }
    });

    return { key, total, segments };
  });
}
