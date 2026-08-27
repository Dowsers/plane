/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IProjectLite } from "../project";
import type { IUserLite } from "../users";

// docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
// Work Logs", feature 1 "Saisie de temps par work item") in plane-selfhost -
// mirrors apps/api/plane/db/models/issue_worklog.py's `IssueWorklog` model.
export type TIssueWorklog = {
  id: string;
  workspace: string;
  project: string;
  issue: string;
  logged_by: string;
  logged_by_detail: IUserLite;
  duration: number;
  logged_at: string;
  description: string;
  timesheet_period: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | undefined;
  updated_by: string | undefined;
};

export type TIssueWorklogMap = {
  [worklog_id: string]: TIssueWorklog;
};

export type TIssueWorklogIdMap = {
  [issue_id: string]: string[];
};

export type TWorklogOperations = {
  createWorklog: (data: Partial<TIssueWorklog>) => Promise<TIssueWorklog | undefined>;
  updateWorklog: (worklogId: string, data: Partial<TIssueWorklog>) => Promise<void>;
  removeWorklog: (worklogId: string) => Promise<void>;
};

// docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
// Work Logs", feature 3 "Workflow d'approbation de timesheet") - mirrors
// `TimesheetPeriod`.
export type TTimesheetPeriodStatus = "draft" | "submitted" | "approved" | "rejected";

export type TTimesheetPeriod = {
  id: string;
  workspace: string;
  project: string;
  project_detail: IProjectLite;
  logged_by: string;
  logged_by_detail: IUserLite;
  period_start: string;
  period_end: string;
  status: TTimesheetPeriodStatus;
  submitted_at: string | null;
  approved_by: string | null;
  approved_by_detail: IUserLite | null;
  approved_at: string | null;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
};

// docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
// Work Logs", feature 2 "Timesheets historiques et rapports agrégés") in
// plane-selfhost - mirrors the shared response shape of
// WorkspaceWorklogReportEndpoint/ProjectWorklogReportEndpoint/
// MyWorklogReportEndpoint (apps/api/plane/app/views/issue_worklog/report.py).
export type TWorklogReportGroupBy = "project" | "member";

export type TWorklogReportRow = {
  project_id?: string;
  member_id?: string;
  total_duration: number;
  entry_count: number;
};

export type TWorklogReport = {
  group_by: TWorklogReportGroupBy;
  results: TWorklogReportRow[];
  total_duration: number;
  total_entries: number;
};

// Query filters shared by the workspace/project/"my" report endpoints and
// the CSV export trigger - a plain object rather than URLSearchParams so
// callers can build it once and pass it to both the report GET and the
// export POST.
export type TWorklogReportFilters = {
  project_id?: string[];
  member_id?: string[];
  date_from?: string;
  date_to?: string;
  group_by?: TWorklogReportGroupBy;
};
