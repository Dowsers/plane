# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
Work Logs", feature 2 "Timesheets historiques et rapports agrégés") in
plane-selfhost. No new persistence model - aggregation is computed on
demand via GROUP BY over IssueWorklog (exigence 8 explicitly rules out a
snapshot table for this MVP).
"""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Django imports
from django.db.models import Count, Sum

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import IssueWorklog, Project


def _apply_filters(queryset, request):
    project_ids = request.query_params.getlist("project_id")
    if project_ids:
        queryset = queryset.filter(project_id__in=project_ids)

    member_ids = request.query_params.getlist("member_id")
    if member_ids:
        queryset = queryset.filter(logged_by_id__in=member_ids)

    date_from = request.query_params.get("date_from")
    if date_from:
        queryset = queryset.filter(logged_at__gte=date_from)

    date_to = request.query_params.get("date_to")
    if date_to:
        queryset = queryset.filter(logged_at__lte=date_to)

    return queryset


def _grouped_report(queryset, group_by):
    """
    Exigence 2 - at minimum two groupings, project and member, each with
    total minutes and entry count.
    """
    if group_by == "member":
        rows = (
            queryset.values("logged_by_id")
            .annotate(total_duration=Sum("duration"), entry_count=Count("id"))
            .order_by("-total_duration")
        )
        return [
            {
                "member_id": row["logged_by_id"],
                "total_duration": row["total_duration"] or 0,
                "entry_count": row["entry_count"],
            }
            for row in rows
        ]

    # default: group by project
    rows = (
        queryset.values("project_id")
        .annotate(total_duration=Sum("duration"), entry_count=Count("id"))
        .order_by("-total_duration")
    )
    return [
        {
            "project_id": row["project_id"],
            "total_duration": row["total_duration"] or 0,
            "entry_count": row["entry_count"],
        }
        for row in rows
    ]


class WorkspaceWorklogReportEndpoint(BaseAPIView):
    """
    GET /api/workspaces/<slug>/worklogs/report/ - workspace-wide aggregated
    report. Exigence 10 - restricted to workspace Admins; a project Admin
    without workspace-Admin role only sees their own projects' aggregation,
    which is what the project-scoped report endpoint (below) already
    provides.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        queryset = IssueWorklog.objects.filter(workspace__slug=slug)
        queryset = _apply_filters(queryset, request)

        group_by = request.query_params.get("group_by", "project")
        results = _grouped_report(queryset, group_by)

        total_duration = sum(row["total_duration"] for row in results)
        total_entries = sum(row["entry_count"] for row in results)

        return Response(
            {
                "group_by": group_by if group_by == "member" else "project",
                "results": results,
                "total_duration": total_duration,
                "total_entries": total_entries,
            },
            status=status.HTTP_200_OK,
        )


class ProjectWorklogReportEndpoint(BaseAPIView):
    """
    GET /api/workspaces/<slug>/projects/<project_id>/worklogs/report/ -
    project-scoped aggregated report, open to any project member (exigence
    3 - non-Admins only see projects they have read access to; scoping to
    a single project_id in the URL and gating via allow_permission's
    PROJECT-level role check already enforces that).
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id):
        queryset = IssueWorklog.objects.filter(workspace__slug=slug, project_id=project_id)
        queryset = _apply_filters(queryset, request)

        group_by = request.query_params.get("group_by", "member")
        results = _grouped_report(queryset, group_by)

        total_duration = sum(row["total_duration"] for row in results)
        total_entries = sum(row["entry_count"] for row in results)

        return Response(
            {
                "group_by": group_by if group_by == "project" else "member",
                "results": results,
                "total_duration": total_duration,
                "total_entries": total_entries,
            },
            status=status.HTTP_200_OK,
        )


class MyWorklogReportEndpoint(BaseAPIView):
    """
    "Mon temps" / "My time" surface (feature 2, user story 5) - the
    requesting user's own entries across every project they belong to in
    this workspace, defaulting `logged_by` to the current user regardless
    of role.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        accessible_project_ids = Project.objects.filter(
            workspace__slug=slug,
            project_projectmember__member=request.user,
            project_projectmember__is_active=True,
            archived_at__isnull=True,
        ).values_list("id", flat=True)

        queryset = IssueWorklog.objects.filter(
            workspace__slug=slug,
            logged_by=request.user,
            project_id__in=accessible_project_ids,
        )
        queryset = _apply_filters(queryset, request)

        group_by = request.query_params.get("group_by", "project")
        results = _grouped_report(queryset, group_by)

        total_duration = sum(row["total_duration"] for row in results)
        total_entries = sum(row["entry_count"] for row in results)

        return Response(
            {
                "group_by": group_by if group_by == "member" else "project",
                "results": results,
                "total_duration": total_duration,
                "total_entries": total_entries,
            },
            status=status.HTTP_200_OK,
        )
