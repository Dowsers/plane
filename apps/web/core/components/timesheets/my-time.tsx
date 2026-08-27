/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TTimesheetPeriod } from "@plane/types";
import { Button } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
// services
import { IssueWorklogService } from "@/services/issue/issue_worklog.service";
// local imports
import type { TTimesheetFilters } from "./filters";
import { TimesheetFilters } from "./filters";
import { TimesheetReportTable } from "./report-table";
import { TimesheetStatusBanner } from "./status-banner";

const issueWorklogService = new IssueWorklogService();

const MY_WORKLOG_REPORT_KEY = (workspaceSlug: string, filters: TTimesheetFilters) =>
  `MY_WORKLOG_REPORT_${workspaceSlug}_${JSON.stringify(filters)}`;

const MY_TIMESHEET_PERIODS_KEY = (workspaceSlug: string, projectIds: string[]) =>
  `MY_TIMESHEET_PERIODS_${workspaceSlug}_${projectIds.join(",")}`;

/** Monday-Sunday bounds for the week containing `date` - the workspace's
 * `timesheet_period_granularity` may also be "month", but this MVP surface
 * only offers a one-click "submit the current week" shortcut regardless of
 * that setting (the member can always submit a different range later via
 * the API; a full period-picker is not in scope here). */
const getCurrentWeekBounds = (): { start: string; end: string } => {
  const now = new Date();
  const day = now.getDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: renderFormattedPayloadDate(monday) ?? "",
    end: renderFormattedPayloadDate(sunday) ?? "",
  };
};

type Props = {
  workspaceSlug: string;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 2, "Considérations API/UX" - "Section 'Mon temps' en
 * vue personnelle ... limitée par défaut à logged_by = utilisateur
 * courant") + feature 3, "Considérations API/UX" - "Sur la page 'Mon
 * temps', un bandeau de statut par période avec bouton 'Soumettre pour
 * approbation'" in plane-selfhost. Backed by `GET .../worklogs/my-report/`
 * (defaults `logged_by` to the current user server-side, see
 * MyWorklogReportEndpoint) for the aggregated numbers, and per-project `GET
 * .../timesheet-periods/?logged_by=<me>` for the submit/status banners
 * (feature 3 is scoped per-project via the project_lead approver, so there
 * is no workspace-wide "my periods" endpoint to call instead).
 */
export const MyTimesheet = observer(function MyTimesheet(props: Props) {
  const { workspaceSlug } = props;
  const { data: currentUser } = useUser();
  const { joinedProjectIds, getProjectById } = useProject();
  const [filters, setFilters] = useState<TTimesheetFilters>({ group_by: "project" });
  const [submittingProjectId, setSubmittingProjectId] = useState<string | null>(null);

  const { data: report, isLoading } = useSWR(MY_WORKLOG_REPORT_KEY(workspaceSlug, filters), () =>
    issueWorklogService.getMyWorklogReport(workspaceSlug, filters)
  );

  const timeTrackingProjectIds = useMemo(
    () => (joinedProjectIds ?? []).filter((id) => getProjectById(id)?.is_time_tracking_enabled),
    [joinedProjectIds, getProjectById]
  );

  const { data: myPeriods } = useSWR(
    timeTrackingProjectIds.length > 0 ? MY_TIMESHEET_PERIODS_KEY(workspaceSlug, timeTrackingProjectIds) : null,
    async () => {
      const perProject = await Promise.all(
        timeTrackingProjectIds.map((projectId) =>
          issueWorklogService
            .getTimesheetPeriods(workspaceSlug, projectId, { logged_by: currentUser?.id })
            .then((response) => response.results)
            .catch(() => [] as TTimesheetPeriod[])
        )
      );
      // eslint-disable-next-line unicorn/no-array-sort -- freshly-built local array (perProject.flat() already returns a new array), no shared-reference mutation risk; toSorted() needs an ES2023 lib bump out of scope here
      return perProject.flat().sort((a, b) => (a.period_start < b.period_start ? 1 : -1));
    }
  );

  const refreshPeriods = () => {
    if (timeTrackingProjectIds.length > 0) {
      void mutate(MY_TIMESHEET_PERIODS_KEY(workspaceSlug, timeTrackingProjectIds));
    }
  };

  const { start: weekStart, end: weekEnd } = useMemo(() => getCurrentWeekBounds(), []);

  const handleSubmitCurrentWeek = async (projectId: string) => {
    setSubmittingProjectId(projectId);
    try {
      await issueWorklogService.submitTimesheetPeriod(workspaceSlug, projectId, weekStart, weekEnd);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Submitted", message: "Your timesheet was submitted for approval." });
      refreshPeriods();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to submit the timesheet for approval.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setSubmittingProjectId(null);
    }
  };

  // Projects that don't yet have a TimesheetPeriod row covering the
  // current week - `submit/` creates it on first call (exigence 2), so
  // these get a plain "submit current week" affordance instead of a
  // status banner.
  const projectsWithoutCurrentWeekPeriod = timeTrackingProjectIds.filter(
    (projectId) =>
      !myPeriods?.some(
        (period) => period.project === projectId && period.period_start === weekStart && period.period_end === weekEnd
      )
  );

  return (
    <div className="flex flex-col gap-4">
      <TimesheetFilters filters={filters} onChange={setFilters} hideMemberFilter />

      {myPeriods && myPeriods.length > 0 && (
        <div className="flex flex-col gap-2">
          {myPeriods.map((period) => (
            <TimesheetStatusBanner
              key={period.id}
              period={period}
              isSubmitting={submittingProjectId === period.project}
              onSubmit={
                period.status === "draft" || period.status === "rejected"
                  ? () => handleSubmitCurrentWeek(period.project)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {projectsWithoutCurrentWeekPeriod.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border-[0.5px] border-subtle p-3">
          <span className="text-13 text-secondary">Submit this week&apos;s time for approval:</span>
          {projectsWithoutCurrentWeekPeriod.map((projectId) => (
            <Button
              key={projectId}
              variant="neutral-primary"
              size="sm"
              loading={submittingProjectId === projectId}
              disabled={submittingProjectId !== null}
              onClick={() => handleSubmitCurrentWeek(projectId)}
            >
              {getProjectById(projectId)?.name}
            </Button>
          ))}
        </div>
      )}

      <TimesheetReportTable report={report} isLoading={isLoading} />
    </div>
  );
});
