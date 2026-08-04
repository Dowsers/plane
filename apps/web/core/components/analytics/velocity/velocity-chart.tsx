/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane package imports
import { useTranslation } from "@plane/i18n";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { TBarItem, TChartData, TVelocityRollupItem } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useAnalytics } from "@/hooks/store/use-analytics";
// services
import { AnalyticsService } from "@/services/analytics.service";
// local imports
import AnalyticsSectionWrapper from "../analytics-section-wrapper";
import { DataTable } from "../insight-table/data-table";
import { ChartLoader } from "../loaders";

const analyticsService = new AnalyticsService();

// Matches the "Resolved"/completed-work series colour already used
// elsewhere in Analytics (work-items/created-vs-resolved.tsx) - kept
// consistent rather than introducing a new colour for the same semantic.
const VELOCITY_BAR_COLOR = "#198038";

type TVelocityChartDatum = TChartData<"name", "completed_issues">;

const VelocityChart = observer(function VelocityChart() {
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug.toString();
  const { selectedProjects } = useAnalytics();

  const { data, isLoading } = useSWR(`advance-analytics-velocity-${workspaceSlug}-${selectedProjects}`, () =>
    analyticsService.getAdvanceAnalyticsVelocity(
      workspaceSlug,
      selectedProjects?.length > 0 ? { project_ids: selectedProjects.join(",") } : undefined
    )
  );

  // Cycle names alone can collide across projects, so the chart's x-axis
  // label disambiguates with the project name - the table below carries the
  // exact per-project/per-cycle breakdown.
  const chartData: TVelocityChartDatum[] = useMemo(
    () =>
      (data ?? []).map((item) => ({
        name: `${item.cycle_name} · ${item.project_name}`,
        completed_issues: item.completed_issues,
      })),
    [data]
  );

  const bars: TBarItem<"completed_issues">[] = useMemo(
    () => [
      {
        key: "completed_issues",
        label: t("workspace_projects.state.completed"),
        fill: VELOCITY_BAR_COLOR,
        textClassName: "",
        stackId: "bar-one",
        showTopBorderRadius: () => true,
        showBottomBorderRadius: () => true,
      },
    ],
    [t]
  );

  const columns: ColumnDef<TVelocityRollupItem>[] = useMemo(
    () => [
      {
        accessorKey: "project_name",
        header: () => t("common.project"),
      },
      {
        accessorKey: "cycle_name",
        header: () => t("common.cycle"),
      },
      {
        accessorKey: "completed_issues",
        header: () => (
          <div className="text-right">{t("workspace_analytics.velocity_rollup.columns.completed_work_items")}</div>
        ),
        cell: ({ row }) => <div className="text-right">{row.original.completed_issues}</div>,
      },
      {
        accessorKey: "completed_estimate_points",
        header: () => (
          <div className="text-right">{t("workspace_analytics.velocity_rollup.columns.completed_estimate_points")}</div>
        ),
        cell: ({ row }) => <div className="text-right">{row.original.completed_estimate_points}</div>,
      },
      {
        accessorKey: "end_date",
        header: () => t("workspace_analytics.velocity_rollup.columns.end_date"),
        cell: ({ row }) => renderFormattedDate(row.original.end_date) ?? row.original.end_date,
      },
    ],
    [t]
  );

  return (
    <AnalyticsSectionWrapper title={t("workspace_analytics.velocity_rollup.title")}>
      {isLoading ? (
        <ChartLoader />
      ) : chartData.length > 0 ? (
        <div className="flex flex-col gap-8">
          <BarChart
            className="h-[370px] w-full"
            data={chartData}
            bars={bars}
            margin={{ bottom: 40 }}
            xAxis={{
              key: "name",
              label: t("common.cycles"),
              dy: 30,
            }}
            yAxis={{
              key: "completed_issues",
              label: t("workspace_analytics.velocity_rollup.columns.completed_work_items"),
              offset: -60,
              dx: -26,
              allowDecimals: false,
            }}
          />
          <DataTable
            data={data ?? []}
            columns={columns}
            searchPlaceholder={`${data?.length ?? 0} ${t("common.cycles")}`}
          />
        </div>
      ) : (
        <EmptyStateCompact
          assetKey="unknown"
          assetClassName="size-20"
          rootClassName="border border-subtle px-5 py-10 md:py-20 md:px-20"
          title={t("workspace_empty_state.analytics_work_items.title")}
        />
      )}
    </AnalyticsSectionWrapper>
  );
});

export default VelocityChart;
