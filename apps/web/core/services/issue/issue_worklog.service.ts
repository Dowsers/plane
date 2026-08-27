/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane types
import { API_BASE_URL } from "@plane/constants";
import type {
  IExportServiceResponse,
  TIssueWorklog,
  TTimesheetPeriod,
  TWorklogReport,
  TWorklogReportFilters,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 1 "Saisie de temps par work item") in plane-selfhost.
 * Mirrors IssueCommentService (issue_comment.service.ts) - deliberately NOT
 * parameterized by `TIssueServiceType` (issues vs epics) since the backend
 * only exposes worklog routes under `.../issues/<issue_id>/worklogs/` for
 * this MVP (epics are out of scope, see spec "Hors périmètre").
 *
 * Also carries the feature 2 (rapports agrégés + export CSV) and feature 3
 * (workflow d'approbation) HTTP calls - kept in this same service rather
 * than a second file since they all hang off the same
 * `.../workspaces/<slug>/worklogs/*` and `.../timesheet-periods/*` route
 * family declared in apps/api/plane/app/urls/issue_worklog.py.
 */
export class IssueWorklogService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private buildReportParams(filters: TWorklogReportFilters): URLSearchParams {
    const params = new URLSearchParams();
    (filters.project_id ?? []).forEach((id) => params.append("project_id", id));
    (filters.member_id ?? []).forEach((id) => params.append("member_id", id));
    if (filters.date_from) params.append("date_from", filters.date_from);
    if (filters.date_to) params.append("date_to", filters.date_to);
    if (filters.group_by) params.append("group_by", filters.group_by);
    return params;
  }

  /** GET /api/workspaces/<slug>/worklogs/report/ - workspace Admin only. */
  async getWorkspaceWorklogReport(workspaceSlug: string, filters: TWorklogReportFilters): Promise<TWorklogReport> {
    const params = this.buildReportParams(filters);
    return this.get(`/api/workspaces/${workspaceSlug}/worklogs/report/?${params.toString()}`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/worklogs/my-report/ - "Mon temps", defaults logged_by to the current user server-side. */
  async getMyWorklogReport(workspaceSlug: string, filters: TWorklogReportFilters): Promise<TWorklogReport> {
    const params = this.buildReportParams(filters);
    return this.get(`/api/workspaces/${workspaceSlug}/worklogs/my-report/?${params.toString()}`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/projects/<project_id>/worklogs/report/ - any project member. */
  async getProjectWorklogReport(
    workspaceSlug: string,
    projectId: string,
    filters: TWorklogReportFilters
  ): Promise<TWorklogReport> {
    const params = this.buildReportParams(filters);
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/worklogs/report/?${params.toString()}`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST /api/workspaces/<slug>/worklogs/export/ - triggers the async CSV export (ExporterHistory type="issue_worklogs"). */
  async exportWorklogs(
    workspaceSlug: string,
    filters: TWorklogReportFilters
  ): Promise<{ message: string; id: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/worklogs/export/`, {
      project_id: filters.project_id ?? [],
      member_id: filters.member_id ?? [],
      date_from: filters.date_from,
      date_to: filters.date_to,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/worklogs/export/ - status/download polling for the current user's own worklog exports. */
  async getWorklogExports(workspaceSlug: string, cursor: string, perPage: number): Promise<IExportServiceResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/worklogs/export/`, {
      params: { per_page: perPage, cursor },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** GET /api/workspaces/<slug>/projects/<project_id>/timesheet-periods/?logged_by=<id>&status=<status> */
  async getTimesheetPeriods(
    workspaceSlug: string,
    projectId: string,
    query: { logged_by?: string; status?: string; cursor?: string; per_page?: number } = {}
  ): Promise<{ results: TTimesheetPeriod[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheet-periods/`, {
      params: {
        logged_by__id: query.logged_by,
        status: query.status,
        per_page: query.per_page ?? 100,
        cursor: query.cursor ?? `${query.per_page ?? 100}:0:0`,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST .../timesheet-periods/submit/ - creates/transitions draft -> submitted for the current user. */
  async submitTimesheetPeriod(
    workspaceSlug: string,
    projectId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<TTimesheetPeriod> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheet-periods/submit/`, {
      period_start: periodStart,
      period_end: periodEnd,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST .../timesheet-periods/<id>/approve/ - approver/Admin only. */
  async approveTimesheetPeriod(workspaceSlug: string, projectId: string, periodId: string): Promise<TTimesheetPeriod> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheet-periods/${periodId}/approve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST .../timesheet-periods/<id>/reject/ - approver/Admin only, rejection_reason required. */
  async rejectTimesheetPeriod(
    workspaceSlug: string,
    projectId: string,
    periodId: string,
    rejectionReason: string
  ): Promise<TTimesheetPeriod> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheet-periods/${periodId}/reject/`, {
      rejection_reason: rejectionReason,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** POST .../timesheet-periods/<id>/withdraw/ - author only, while still `submitted`. */
  async withdrawTimesheetPeriod(workspaceSlug: string, projectId: string, periodId: string): Promise<TTimesheetPeriod> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheet-periods/${periodId}/withdraw/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssueWorklogs(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueWorklog[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`)
      .then((response) => response?.data?.results ?? response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssueWorklogTotal(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<{ total_duration: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/total/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueWorklog(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueWorklog>
  ): Promise<TIssueWorklog> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchIssueWorklog(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<TIssueWorklog>
  ): Promise<TIssueWorklog> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/${worklogId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueWorklog(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/${worklogId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
