/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { AreaChart } from "@plane/propel/charts/area-chart";
import type { TAreaChartProps, TChartData } from "@plane/types";
import { Loader } from "@plane/ui";
import { csvDownload, renderFormattedDate } from "@plane/utils";
// services
import { ProjectService } from "@/services/project/project.service";

const projectService = new ProjectService();

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * Project-level "Scope & velocity" cross-cycle chart - the genuinely new
 * surface described by docs/feature-specs/05-insights-analytics.md,
 * section "1. Graphiques de progression cycle/projet", exigences 7/8 (the
 * cycle-level burndown/burn-up chart it also describes already existed and
 * was ungated before this patch - see the patch notes). Aggregates every
 * dated cycle chronologically and shows a velocity-based projected
 * completion date for the project's remaining backlog.
 *
 * Hidden entirely when the project has cycles disabled (`cycles_enabled`
 * false) - exigence 8 - in which case only the pre-existing all-issues
 * created-vs-resolved chart (`ProjectAdvanceAnalyticsChartEndpoint`, see
 * apps/web/core/components/analytics/work-items/created-vs-resolved.tsx)
 * stays.
 */
export const ProjectVelocityCard = observer(function ProjectVelocityCard(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();

  const { data: progress, isLoading } = useSWR(
    workspaceSlug && projectId ? `PROJECT_PROGRESS_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => projectService.getProjectProgress(workspaceSlug, projectId) : null
  );

  const chartData: TChartData<string, string>[] = useMemo(
    () =>
      (progress?.cycles ?? []).map((cycle) => ({
        name: cycle.name,
        scope: cycle.scope,
        started: cycle.started,
        completed: cycle.completed,
      })),
    [progress]
  );

  const unitLabel = progress?.estimate_type === "points" ? "points" : "work items";

  const areas: TAreaChartProps<string, string>["areas"] = [
    {
      key: "scope",
      label: `Scope (${unitLabel})`,
      strokeColor: "#F59E0B",
      fill: "#F59E0B33",
      fillOpacity: 1,
      showDot: true,
      smoothCurves: true,
      strokeOpacity: 1,
      stackId: "scope",
    },
    {
      key: "started",
      label: `Started (${unitLabel})`,
      strokeColor: "#A9BBD0",
      fill: "#A9BBD0",
      fillOpacity: 0,
      showDot: true,
      smoothCurves: true,
      strokeOpacity: 1,
      stackId: "started",
      style: { strokeDasharray: "6, 3", strokeWidth: 1 },
    },
    {
      key: "completed",
      label: `Completed (${unitLabel})`,
      strokeColor: "#3F76FF",
      fill: "#3F76FF33",
      fillOpacity: 1,
      showDot: true,
      smoothCurves: true,
      strokeOpacity: 1,
      stackId: "completed",
    },
  ];

  // Guest-accessible client-side CSV export (exigence 11) - re-serializes
  // the already-fetched chart data, no new backend export pipeline. See
  // docs/feature-specs/05-insights-analytics.md patch notes.
  const onExportCsv = () => {
    if (!progress) return;
    const rows: string[][] = [["Cycle", "Start date", "End date", "Scope", "Started", "Completed"]];
    progress.cycles.forEach((cycle) => {
      rows.push([
        cycle.name,
        cycle.start_date,
        cycle.end_date,
        String(cycle.scope),
        String(cycle.started),
        String(cycle.completed),
      ]);
    });
    csvDownload(rows, `project-scope-velocity-${projectId}`);
  };

  if (progress && !progress.cycles_enabled) return null;

  if (isLoading || !progress) {
    return (
      <Loader className="w-full">
        <Loader.Item width="100%" height="200px" />
      </Loader>
    );
  }

  if (progress.cycles.length === 0) {
    return (
      <div className="rounded-md border border-subtle p-4 text-13 text-tertiary">
        Not enough data yet - close at least one cycle to see scope &amp; velocity trends here.
      </div>
    );
  }

  const { velocity } = progress;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-subtle p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-14 font-semibold text-primary">Scope &amp; velocity</h3>
        <button
          type="button"
          onClick={onExportCsv}
          className="rounded-sm border border-subtle px-2 py-1 text-11 font-medium text-secondary hover:bg-surface-2"
        >
          {t("exporter.csv.short_description")}
        </button>
      </div>
      <AreaChart
        data={chartData}
        areas={areas}
        xAxis={{ key: "name", label: "Cycle" }}
        yAxis={{ key: "scope", label: unitLabel }}
        margin={{ bottom: 30 }}
        className="h-[320px] w-full"
        legend={{
          align: "center",
          verticalAlign: "bottom",
          layout: "horizontal",
          wrapperStyles: { marginTop: 20 },
        }}
      />
      <div className="flex flex-col gap-1 text-13 text-secondary">
        {velocity.has_enough_data ? (
          <>
            <div>
              Average velocity: {velocity.average_velocity?.toFixed(1)} {unitLabel} / cycle (last {velocity.window_size}{" "}
              closed cycle{velocity.window_size > 1 ? "s" : ""})
            </div>
            {velocity.projected_completion_date && (
              <div>
                Projected completion: {renderFormattedDate(velocity.projected_completion_date)}
                {velocity.optimistic_completion_date && velocity.pessimistic_completion_date && (
                  <>
                    {" "}
                    (between {renderFormattedDate(velocity.optimistic_completion_date)} and{" "}
                    {renderFormattedDate(velocity.pessimistic_completion_date)})
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div>Not enough closed cycles yet to project a completion date.</div>
        )}
      </div>
    </div>
  );
});
