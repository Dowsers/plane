/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { CustomSelect } from "@plane/ui";
// hooks
// services
import { IssueWorklogService } from "@/services/issue/issue_worklog.service";
// local imports
import { TimesheetExportButton } from "./export-button";
import type { TTimesheetFilters } from "./filters";
import { TimesheetFilters } from "./filters";
import { TimesheetReportTable } from "./report-table";

const issueWorklogService = new IssueWorklogService();

const WORKLOG_REPORT_KEY = (workspaceSlug: string, filters: TTimesheetFilters) =>
  `WORKLOG_REPORT_${workspaceSlug}_${JSON.stringify(filters)}`;

type Props = {
  workspaceSlug: string;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 2 "Timesheets historiques et rapports agrégés") in
 * plane-selfhost - workspace-wide aggregated report (Admin-only server-side,
 * see WorkspaceWorklogReportEndpoint) with project/member/date filters, a
 * project/member grouping toggle, and a CSV export trigger.
 */
export const WorkspaceWorklogReport = observer(function WorkspaceWorklogReport(props: Props) {
  const { workspaceSlug } = props;
  const [filters, setFilters] = useState<TTimesheetFilters>({ group_by: "project" });

  const { data: report, isLoading } = useSWR(WORKLOG_REPORT_KEY(workspaceSlug, filters), () =>
    issueWorklogService.getWorkspaceWorklogReport(workspaceSlug, filters)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TimesheetFilters filters={filters} onChange={setFilters} />
        <div className="flex items-center gap-2">
          <CustomSelect
            value={filters.group_by ?? "project"}
            label={filters.group_by === "member" ? "Group by member" : "Group by project"}
            onChange={(value: TTimesheetFilters["group_by"]) => setFilters({ ...filters, group_by: value })}
          >
            <CustomSelect.Option value="project">Group by project</CustomSelect.Option>
            <CustomSelect.Option value="member">Group by member</CustomSelect.Option>
          </CustomSelect>
          <TimesheetExportButton workspaceSlug={workspaceSlug} filters={filters} />
        </div>
      </div>
      <TimesheetReportTable report={report} isLoading={isLoading} />
    </div>
  );
});
