/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTheme } from "next-themes";
import useSWR from "swr";
// plane imports
import { CHART_COLOR_PALETTES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { BarChart } from "@plane/propel/charts/bar-chart";
import type { TBarItem, TDashboardWidget, TDashboardWidgetChartData } from "@plane/types";
import { parseDashboardChartDistribution } from "@plane/utils";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
// local imports
import { WidgetDataStateWrapper } from "./widget-data-state-wrapper";

type Props = {
  workspaceSlug: string;
  dashboardId: string;
  widget: Extract<TDashboardWidget, { widget_type: "chart" }>;
};

/** Mirrors `TChartDatum` (`@plane/types`, `charts/common.ts`)'s own
 * "named fields + numeric index signature" shape, needed so `BarChart`'s
 * generic `xAxis.key`/`yAxis.key`/`bars[].key` props can resolve against a
 * dynamic, per-widget set of segment keys. */
type TDashboardChartRow = { name: string; total: number } & Record<string, number | string>;

/**
 * Renders a `chart` widget's computed data as a bar chart, using the same
 * `@plane/propel/charts` `BarChart` component the legacy single-project
 * analytics builder already uses
 * (`apps/web/core/components/analytics/work-items/priority-chart.tsx`).
 * Deliberately does NOT reuse that file's `parseChartData`/`TChart`
 * pipeline - that pipeline resolves dimension *labels* (e.g. a state's
 * name/color) via the legacy `ChartXAxisProperty` enum, which has no
 * mapping for this widget's raw field vocabulary (`state_id`, `priority`,
 * ...). Instead uses the shared, deliberately-generic
 * `parseDashboardChartDistribution` helper (`@plane/utils`), which treats
 * `distribution` as opaque per the backend contract and just sums
 * count/estimate per dimension key (with an optional per-segment
 * breakdown) - the same helper the public `apps/space` viewer uses so both
 * surfaces render identically.
 */
export function ChartWidget({ workspaceSlug, dashboardId, widget }: Props) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { getWidgetData } = useCustomDashboard();

  const { data, error, isLoading, mutate } = useSWR(
    `DASHBOARD_WIDGET_DATA_${widget.id}`,
    () => getWidgetData(workspaceSlug, dashboardId, widget.id) as Promise<TDashboardWidgetChartData>,
    { revalidateOnFocus: false }
  );

  const rows = parseDashboardChartDistribution(data?.distribution, widget.config.y_axis);
  const segmentKeys = Array.from(new Set(rows.flatMap((row) => (row.segments ? Object.keys(row.segments) : []))));
  const baseColors = CHART_COLOR_PALETTES[0]?.[resolvedTheme === "dark" ? "dark" : "light"] ?? ["#6366F1"];

  const chartData: TDashboardChartRow[] = rows.map((row) => {
    const datum: TDashboardChartRow = { name: row.key, total: row.total };
    if (row.segments) {
      for (const [segmentKey, value] of Object.entries(row.segments)) {
        datum[segmentKey] = value;
      }
    }
    return datum;
  });

  const bars: TBarItem<string>[] =
    segmentKeys.length > 0
      ? segmentKeys.map((key, index) => ({
          key,
          label: key,
          stackId: "bar-one",
          fill: baseColors[index % baseColors.length],
          textClassName: "",
          showTopBorderRadius: () => true,
          showBottomBorderRadius: () => true,
        }))
      : [
          {
            key: "total",
            label: t("workspace_dashboards.widget.data.total"),
            stackId: "bar-one",
            fill: baseColors[0],
            textClassName: "",
            showTopBorderRadius: () => true,
            showBottomBorderRadius: () => true,
          },
        ];

  return (
    <WidgetDataStateWrapper
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && chartData.length === 0}
      onRetry={() => mutate()}
    >
      <BarChart
        className="h-full w-full"
        data={chartData}
        bars={bars}
        margin={{ bottom: 20 }}
        xAxis={{ key: "name", label: "" }}
        yAxis={{ key: "total", label: "" }}
      />
    </WidgetDataStateWrapper>
  );
}
