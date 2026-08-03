/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
// plane imports
import { AreaChart } from "@plane/propel/charts/area-chart";
import type { TAreaChartProps, TChartData, TCyclePlotType, TModuleCompletionChartDistribution } from "@plane/types";
import { renderFormattedDateWithoutYear } from "@plane/utils";

type Props = {
  distribution: TModuleCompletionChartDistribution;
  totalIssues: number;
  className?: string;
  plotTitle?: string;
  /**
   * Burndown (remaining work, the historical default) vs burn-up
   * (cumulative completed work) - see
   * docs/feature-specs/05-insights-analytics.md, exigence 3. Defaults to
   * "burndown" so existing callers (Module analytics sidebar, Active Cycle
   * widget) that never pass this render exactly as before.
   */
  plotType?: TCyclePlotType;
  /**
   * Real day-by-day net scope line (see `cycle_scope_plot` on the
   * backend) - optional, and only ever passed by the Cycle analytics
   * sidebar today. When omitted the chart renders exactly as it always
   * has (current/ideal only).
   */
  scopeDistribution?: TModuleCompletionChartDistribution;
};

function ProgressChart({
  distribution,
  totalIssues,
  className = "",
  plotTitle = "work items",
  plotType = "burndown",
  scopeDistribution,
}: Props) {
  const dates = Object.keys(distribution ?? []);
  const isBurnUp = plotType === "burnup";

  const chartData: TChartData<string, string>[] = dates.map((key, index) => {
    const pending = distribution[key] ?? 0;
    const row: TChartData<string, string> = {
      name: renderFormattedDateWithoutYear(key),
      current: isBurnUp ? Math.max(totalIssues - pending, 0) : pending,
      ideal: totalIssues * (1 - index / (dates.length - 1)),
    };
    if (scopeDistribution) {
      row.scope = scopeDistribution[key] ?? null;
    }
    return row;
  });

  const areas: TAreaChartProps<string, string>["areas"] = [
    {
      key: "current",
      label: isBurnUp ? `Completed ${plotTitle}` : `Current ${plotTitle}`,
      strokeColor: "#3F76FF",
      fill: "#3F76FF33",
      fillOpacity: 1,
      showDot: true,
      smoothCurves: true,
      strokeOpacity: 1,
      stackId: "bar-one",
    },
    {
      key: "ideal",
      label: `Ideal ${plotTitle}`,
      strokeColor: "#A9BBD0",
      fill: "#A9BBD0",
      fillOpacity: 0,
      showDot: true,
      smoothCurves: true,
      strokeOpacity: 1,
      stackId: "bar-two",
      style: {
        strokeDasharray: "6, 3",
        strokeWidth: 1,
      },
    },
  ];

  if (scopeDistribution) {
    areas.push({
      key: "scope",
      label: `Scope (${plotTitle})`,
      strokeColor: "#F59E0B",
      fill: "#F59E0B",
      fillOpacity: 0,
      showDot: false,
      smoothCurves: false,
      strokeOpacity: 1,
      stackId: "bar-three",
    });
  }

  return (
    <div className={`flex w-full items-center justify-center ${className}`}>
      <AreaChart
        data={chartData}
        areas={areas}
        xAxis={{ key: "name", label: "Date" }}
        yAxis={{ key: "current", label: "Completion" }}
        margin={{ bottom: 30 }}
        className="h-[370px] w-full"
        legend={{
          align: "center",
          verticalAlign: "bottom",
          layout: "horizontal",
          wrapperStyles: {
            marginTop: 20,
          },
        }}
      />
    </div>
  );
}

export default ProgressChart;
