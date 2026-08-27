# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssueWorklogViewSet,
    IssueWorklogTotalEndpoint,
    WorkspaceWorklogReportEndpoint,
    ProjectWorklogReportEndpoint,
    MyWorklogReportEndpoint,
    WorklogExportEndpoint,
    TimesheetPeriodViewSet,
    TimesheetPeriodSubmitEndpoint,
    TimesheetPeriodApproveEndpoint,
    TimesheetPeriodRejectEndpoint,
    TimesheetPeriodWithdrawEndpoint,
)

urlpatterns = [
    # Feature 1 - per-issue worklog entries
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/",
        IssueWorklogViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-worklog",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/<uuid:pk>/",
        IssueWorklogViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="issue-worklog",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/total/",
        IssueWorklogTotalEndpoint.as_view(),
        name="issue-worklog-total",
    ),
    # Feature 2 - aggregated reports and CSV export
    path(
        "workspaces/<str:slug>/worklogs/report/",
        WorkspaceWorklogReportEndpoint.as_view(),
        name="workspace-worklog-report",
    ),
    path(
        "workspaces/<str:slug>/worklogs/my-report/",
        MyWorklogReportEndpoint.as_view(),
        name="my-worklog-report",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/worklogs/report/",
        ProjectWorklogReportEndpoint.as_view(),
        name="project-worklog-report",
    ),
    path(
        "workspaces/<str:slug>/worklogs/export/",
        WorklogExportEndpoint.as_view(),
        name="worklog-export",
    ),
    # Feature 3 - timesheet approval workflow
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheet-periods/",
        TimesheetPeriodViewSet.as_view({"get": "list"}),
        name="timesheet-period",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheet-periods/<uuid:pk>/",
        TimesheetPeriodViewSet.as_view({"get": "retrieve"}),
        name="timesheet-period",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheet-periods/submit/",
        TimesheetPeriodSubmitEndpoint.as_view(),
        name="timesheet-period-submit",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheet-periods/<uuid:pk>/approve/",
        TimesheetPeriodApproveEndpoint.as_view(),
        name="timesheet-period-approve",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheet-periods/<uuid:pk>/reject/",
        TimesheetPeriodRejectEndpoint.as_view(),
        name="timesheet-period-reject",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheet-periods/<uuid:pk>/withdraw/",
        TimesheetPeriodWithdrawEndpoint.as_view(),
        name="timesheet-period-withdraw",
    ),
]
