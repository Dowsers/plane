/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TCycleEstimateType, TCyclePlotType } from "@plane/types";
import { Loader } from "@plane/ui";
import { csvDownload, getDate } from "@plane/utils";
// components
import ProgressChart from "@/components/core/sidebar/progress-chart";
import { validateCycleSnapshot } from "@/components/cycles/analytics-sidebar/issue-progress";
import { ChartTypeDropdown, EstimateTypeDropdown } from "@/components/cycles/dropdowns";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";

type ProgressChartProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};
export const SidebarChart = observer(function SidebarChart(props: ProgressChartProps) {
  const { workspaceSlug, projectId, cycleId } = props;

  // hooks
  const {
    getEstimateTypeByCycleId,
    getPlotTypeByCycleId,
    getCycleById,
    fetchCycleDetails,
    fetchArchivedCycleDetails,
    fetchCycleProgressPreferences,
    updateCycleProgressPreferences,
  } = useCycle();
  const { t } = useTranslation();

  // derived data
  const cycleDetails = validateCycleSnapshot(getCycleById(cycleId));
  const cycleStartDate = getDate(cycleDetails?.start_date);
  const cycleEndDate = getDate(cycleDetails?.end_date);
  const totalEstimatePoints = cycleDetails?.total_estimate_points || 0;
  const totalIssues = cycleDetails?.total_issues || 0;
  const estimateType = getEstimateTypeByCycleId(cycleId);
  const plotType: TCyclePlotType = getPlotTypeByCycleId(cycleId);

  const chartDistributionData =
    estimateType === "points" ? cycleDetails?.estimate_distribution : cycleDetails?.distribution || undefined;

  const completionChartDistributionData = chartDistributionData?.completion_chart || undefined;
  const scopeChartDistributionData = chartDistributionData?.scope_chart || undefined;

  // Load the current user's persisted burndown/burn-up + issues/points
  // preference for this cycle once - see
  // docs/feature-specs/05-insights-analytics.md, exigence 3.
  useEffect(() => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    fetchCycleProgressPreferences(workspaceSlug, projectId, cycleId);
  }, [workspaceSlug, projectId, cycleId, fetchCycleProgressPreferences]);

  if (!workspaceSlug || !projectId || !cycleId) return null;

  const isArchived = !!cycleDetails?.archived_at;

  // handlers
  const onEstimateTypeChange = async (value: TCycleEstimateType) => {
    updateCycleProgressPreferences(workspaceSlug, projectId, cycleId, { estimate_type: value });
    try {
      if (isArchived) {
        await fetchArchivedCycleDetails(workspaceSlug, projectId, cycleId);
      } else {
        await fetchCycleDetails(workspaceSlug, projectId, cycleId);
      }
    } catch (err) {
      console.error(err);
      updateCycleProgressPreferences(workspaceSlug, projectId, cycleId, { estimate_type: estimateType });
    }
  };

  const onChartTypeChange = async (value: TCyclePlotType) => {
    updateCycleProgressPreferences(workspaceSlug, projectId, cycleId, { chart_type: value });
  };

  // Guest-accessible client-side CSV export (exigence 11) - re-serializes
  // the chart data already fetched for rendering, no new backend export
  // pipeline. See docs/feature-specs/05-insights-analytics.md patch notes
  // for why this is a deliberate v1 cut vs. a server-side export job.
  const onExportCsv = () => {
    if (!completionChartDistributionData) return;
    const unit = estimateType === "points" ? totalEstimatePoints : totalIssues;
    const rows: string[][] = [
      ["Date", "Scope", estimateType === "points" ? "Remaining points" : "Remaining issues", "Completed", "Ideal"],
    ];
    const dates = Object.keys(completionChartDistributionData);
    dates.forEach((date, index) => {
      const pending = completionChartDistributionData[date] ?? 0;
      const completed = Math.max(unit - pending, 0);
      const ideal = unit * (1 - index / (dates.length - 1));
      const scope = scopeChartDistributionData?.[date] ?? "";
      rows.push([date, String(scope), String(pending), String(completed), String(Math.round(ideal))]);
    });
    csvDownload(rows, `cycle-progress-${cycleId}`);
  };

  return (
    <div>
      <div className="relative flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-2">
          <ChartTypeDropdown value={plotType} onChange={onChartTypeChange} />
          <EstimateTypeDropdown
            value={estimateType}
            onChange={onEstimateTypeChange}
            cycleId={cycleId}
            projectId={projectId}
          />
        </div>
        {completionChartDistributionData && (
          <button
            type="button"
            onClick={onExportCsv}
            className="rounded-sm border border-subtle px-2 py-1 text-11 font-medium text-secondary hover:bg-surface-2"
          >
            {t("exporter.csv.short_description")}
          </button>
        )}
      </div>
      <div className="py-4">
        <div>
          {cycleStartDate && cycleEndDate && completionChartDistributionData ? (
            <Fragment>
              <ProgressChart
                distribution={completionChartDistributionData}
                scopeDistribution={scopeChartDistributionData}
                totalIssues={estimateType === "points" ? totalEstimatePoints : totalIssues}
                plotTitle={estimateType === "points" ? t("points") : t("work_items")}
                plotType={plotType}
              />
            </Fragment>
          ) : (
            <Loader className="mt-4 h-[160px] w-full">
              <Loader.Item width="100%" height="100%" />
            </Loader>
          )}
        </div>
      </div>
    </div>
  );
});
