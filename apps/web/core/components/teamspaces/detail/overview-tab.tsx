/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle } from "lucide-react";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { BarChart } from "@plane/propel/charts/bar-chart";
import type { TBarItem, TChartData } from "@plane/types";
import { CustomSelect, Loader } from "@plane/ui";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";
// local imports
import { TeamspaceOverdueIssuesModal } from "./overdue-issues-modal";
import { TeamspaceRelationsPanel } from "./relations-panel";
import { TeamspaceStatsPanel } from "./stats-panel";

type Props = {
  teamspaceId: string;
};

const GROUP_BY_OPTIONS: { key: "priority" | "due_date" | "start_date"; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "due_date", label: "Due date" },
  { key: "start_date", label: "Start date" },
];

const SUMMARY_ROWS: {
  key: "backlog" | "unstarted" | "started" | "completed" | "cancelled" | "no_due_date";
  label: string;
  color: string;
}[] = [
  { key: "backlog", label: "Backlog", color: STATE_GROUPS.backlog.color },
  { key: "unstarted", label: "Pending", color: STATE_GROUPS.unstarted.color },
  { key: "started", label: "Started", color: STATE_GROUPS.started.color },
  { key: "completed", label: "Completed", color: STATE_GROUPS.completed.color },
  { key: "cancelled", label: "Cancelled", color: STATE_GROUPS.cancelled.color },
  { key: "no_due_date", label: "No due date", color: "var(--text-tertiary)" },
];

export const TeamspaceOverviewTab = observer(function TeamspaceOverviewTab(props: Props) {
  const { teamspaceId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceOverviewById, fetchTeamspaceOverview } = useTeamspace();

  const [groupBy, setGroupBy] = useState<"priority" | "due_date" | "start_date">("priority");
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug ? ["TEAMSPACE_OVERVIEW", workspaceSlug, teamspaceId, groupBy] : null,
    workspaceSlug ? () => fetchTeamspaceOverview(workspaceSlug.toString(), teamspaceId, groupBy) : null,
    { revalidateOnFocus: false }
  );

  const overview = getTeamspaceOverviewById(teamspaceId);

  const groupField = groupBy === "priority" ? "priority" : groupBy === "due_date" ? "target_date" : "start_date";

  const chartData: TChartData<"name", "pending" | "completed">[] = useMemo(
    () =>
      (overview?.progress_chart ?? []).map((row) => ({
        name: row[groupField] != null ? String(row[groupField]) : t("common.none"),
        pending: Number(row.pending ?? 0),
        completed: Number(row.completed ?? 0),
      })),
    [overview?.progress_chart, groupField, t]
  );

  const bars: TBarItem<"pending" | "completed">[] = [
    {
      key: "completed",
      label: "Completed",
      stackId: "bar-one",
      fill: STATE_GROUPS.completed.color,
      textClassName: "",
      showTopBorderRadius: () => true,
      showBottomBorderRadius: () => false,
    },
    {
      key: "pending",
      label: "Pending",
      stackId: "bar-one",
      fill: "var(--text-tertiary)",
      textClassName: "",
      showTopBorderRadius: () => false,
      showBottomBorderRadius: () => true,
    },
  ];

  if (isLoading && !overview) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="60px" />
        <Loader.Item height="280px" />
        <Loader.Item height="200px" />
      </Loader>
    );
  }

  if (!overview) return null;

  const hasNoData =
    overview.overdue_count === 0 &&
    overview.progress_chart.length === 0 &&
    Object.values(overview.summary).every((count) => count === 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Overdue banner - spec section 2 exigence 1/6, clickable, opens the
          list of overdue work items behind the count (see overdue-issues-modal.tsx) */}
      {overview.overdue_count > 0 && (
        <>
          <button
            type="button"
            onClick={() => setIsOverdueModalOpen(true)}
            className="border-danger-primary/40 flex items-center gap-2 rounded-md border-[0.5px] bg-danger-primary/10 px-3 py-2 text-13 text-danger-primary hover:bg-danger-primary/20"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>
              {overview.overdue_count} {t("teamspaces.overview.overdue_work_items")}
            </span>
          </button>
          <TeamspaceOverdueIssuesModal
            isOpen={isOverdueModalOpen}
            teamspaceId={teamspaceId}
            handleClose={() => setIsOverdueModalOpen(false)}
          />
        </>
      )}

      {hasNoData ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <h3 className="text-16 font-medium">{t("teamspaces.overview.empty_state.title")}</h3>
          <p className="max-w-md text-13 text-secondary">{t("teamspaces.overview.empty_state.description")}</p>
        </div>
      ) : (
        <>
          {/* Team Progress - stacked bar chart with priority/due_date/start_date grouping toggle */}
          <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-14 font-medium">{t("teamspaces.overview.team_progress")}</h3>
              <CustomSelect
                value={groupBy}
                onChange={(val: "priority" | "due_date" | "start_date") => setGroupBy(val)}
                label={GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label ?? groupBy}
                buttonClassName="!border-subtle !shadow-none rounded-md text-13"
                input
              >
                {GROUP_BY_OPTIONS.map((option) => (
                  <CustomSelect.Option key={option.key} value={option.key}>
                    {option.label}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </div>

            {chartData.length > 0 ? (
              <BarChart
                className="h-[280px] w-full"
                data={chartData}
                bars={bars}
                margin={{ bottom: 30 }}
                xAxis={{ key: "name", label: GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label, dy: 20 }}
                yAxis={{ key: "pending", label: t("teamspaces.overview.work_items_count"), offset: -50, dx: -20 }}
              />
            ) : (
              <p className="py-8 text-center text-13 text-secondary">{t("teamspaces.overview.no_progress_data")}</p>
            )}

            {/* Summary panel - Pending/Completed/Backlog/Cancelled/no due date */}
            <div className="mt-2 grid grid-cols-2 gap-3 border-t border-subtle pt-3 sm:grid-cols-3 lg:grid-cols-6">
              {SUMMARY_ROWS.map((row) => (
                <div key={row.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-11 text-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.label}
                  </div>
                  <span className="text-16 font-semibold">{overview.summary[row.key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Team Relations - Blocking/Blocked tabs */}
          <TeamspaceRelationsPanel teamspaceId={teamspaceId} />

          {/* Team Stats - treemap groupable by project/member/state/dependency/due date */}
          <TeamspaceStatsPanel teamspaceId={teamspaceId} />
        </>
      )}
    </div>
  );
});
