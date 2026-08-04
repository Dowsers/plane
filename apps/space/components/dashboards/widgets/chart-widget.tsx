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
import { SitesDashboardService } from "@plane/services";
import type { TBarItem, TDashboardWidgetChartData, TPublicDashboardWidget } from "@plane/types";
import { parseDashboardChartDistribution } from "@plane/utils";
// local imports
import { PublicWidgetDataState } from "../widget-data-state";

type Props = {
  anchor: string;
  widget: Extract<TPublicDashboardWidget, { widget_type: "chart" }>;
};

/** Mirrors `TChartDatum` (`@plane/types`, `charts/common.ts`)'s own
 * "named fields + numeric index signature" shape - see the identical type
 * in `apps/web/core/components/dashboards/editor/widgets/chart-widget.tsx`
 * for the full rationale (this file is that component's public-viewer
 * counterpart, sharing the same `parseDashboardChartDistribution` helper
 * from `@plane/utils` so both surfaces render identically). */
type TDashboardChartRow = { name: string; total: number } & Record<string, number | string>;

const dashboardService = new SitesDashboardService();

export function PublicChartWidget({ anchor, widget }: Props) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  const { data, error, isLoading } = useSWR(
    `PUBLIC_DASHBOARD_WIDGET_DATA_${anchor}_${widget.id}`,
    () => dashboardService.retrieveWidgetData(anchor, widget.id) as Promise<TDashboardWidgetChartData>,
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
    <PublicWidgetDataState isLoading={isLoading} error={error} isEmpty={!isLoading && !error && chartData.length === 0}>
      <BarChart
        className="h-full w-full"
        data={chartData}
        bars={bars}
        margin={{ bottom: 20 }}
        xAxis={{ key: "name", label: "" }}
        yAxis={{ key: "total", label: "" }}
      />
    </PublicWidgetDataState>
  );
}
