# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Sum
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView, BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueWorklogSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import Issue, IssueWorklog, Project
from plane.utils.host import base_host


class IssueWorklogViewSet(BaseViewSet):
    """
    docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking
    and Work Logs", feature 1 "Saisie de temps par work item") in
    plane-selfhost. Mirrors IssueCommentViewSet
    (plane/app/views/issue/comment.py) - the create/update/delete permission
    pattern (`creator=True, model=IssueWorklog` for edit/delete) is copied
    verbatim from there.
    """

    serializer_class = IssueWorklogSerializer
    model = IssueWorklog

    filterset_fields = ["issue__id", "logged_by__id"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "issue", "logged_by")
            .order_by("-logged_at", "created_at")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        # Exigence 2 - is_time_tracking_enabled is the real activation
        # condition for the whole feature, enforced here (not only hidden
        # client-side).
        if not project.is_time_tracking_enabled:
            return Response(
                {"error": "Time tracking is not enabled for this project."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue = Issue.objects.get(pk=issue_id, project_id=project_id)

        serializer = IssueWorklogSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id, issue_id=issue_id, logged_by=request.user)
            issue_activity.delay(
                type="worklog.activity.created",
                requested_data=json.dumps(serializer.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(issue.id),
                project_id=str(project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            model_activity.delay(
                model_name="issue_worklog",
                model_id=str(serializer.data["id"]),
                requested_data=request.data,
                current_instance=None,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=IssueWorklog)
    def partial_update(self, request, slug, project_id, issue_id, pk):
        worklog = IssueWorklog.objects.get(workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk)
        # Exigence 6, feature 3 - a worklog belonging to a submitted/approved
        # TimesheetPeriod is locked, even for its own author/an Admin;
        # correction requires the approver to reject it first (or the
        # author to withdraw a still-`submitted` one).
        if worklog.timesheet_period_id and worklog.timesheet_period.status in ("submitted", "approved"):
            return Response(
                {"error": "This worklog entry is locked by a submitted or approved timesheet period."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_instance = json.dumps(IssueWorklogSerializer(worklog).data, cls=DjangoJSONEncoder)
        serializer = IssueWorklogSerializer(worklog, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            # Exigence 5, feature 3 - editing an entry belonging to a
            # `rejected` TimesheetPeriod automatically reopens the period
            # to `draft`, ready for a fresh submission, without creating a
            # new TimesheetPeriod row.
            if worklog.timesheet_period_id and worklog.timesheet_period.status == "rejected":
                worklog.timesheet_period.status = "draft"
                worklog.timesheet_period.save(update_fields=["status"])
            issue_activity.delay(
                type="worklog.activity.updated",
                requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=current_instance,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            model_activity.delay(
                model_name="issue_worklog",
                model_id=str(pk),
                requested_data=request.data,
                current_instance=current_instance,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=IssueWorklog)
    def destroy(self, request, slug, project_id, issue_id, pk):
        worklog = IssueWorklog.objects.get(workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk)
        if worklog.timesheet_period_id and worklog.timesheet_period.status in ("submitted", "approved"):
            return Response(
                {"error": "This worklog entry is locked by a submitted or approved timesheet period."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        worklog_id = str(worklog.id)
        worklog.delete()
        issue_activity.delay(
            type="worklog.activity.deleted",
            requested_data=json.dumps({"worklog_id": worklog_id}),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueWorklogTotalEndpoint(BaseAPIView):
    """
    GET .../worklogs/total/ - exigence 8's endpoint form, useful for an
    isolated refresh of the summary badge without reloading the whole issue
    (per the spec's own wording in "Considérations API/UX").
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        total = (
            IssueWorklog.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_id=issue_id,
            ).aggregate(total_duration=Sum("duration"))["total_duration"]
            or 0
        )
        return Response({"total_duration": total}, status=status.HTTP_200_OK)
