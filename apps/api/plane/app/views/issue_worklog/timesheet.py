# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
Work Logs", feature 3 "Workflow d'approbation de timesheet") in
plane-selfhost.

Approval is scoped to whoever is the project's `project_lead` (exigence 3)
or a workspace Admin (exigence 4) - no `TimesheetApprover` delegation model
in this MVP (see "Questions ouvertes" #3 in the spec: project_lead alone is
judged sufficient for a first iteration). This mirrors InitiativeViewSet's
precedent of an inline "Admin OR <specific FK user>" check instead of the
`allow_permission` decorator, which can only express fixed roles, not
"or is the FK-referenced approver".

Status-change activity reuses the existing IssueActivity model with
`issue=None` (already nullable - see comment_reaction activities in
plane.bgtasks.issue_activities_task) rather than a new dedicated model,
consistent with feature 1's choice not to introduce new activity
machinery.
"""

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseViewSet, BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import TimesheetPeriodSerializer
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import IssueActivity, IssueWorklog, Project, TimesheetPeriod, WorkspaceMember


def _is_approver_or_admin(request, slug, project):
    if project.project_lead_id == request.user.id:
        return True
    return WorkspaceMember.objects.filter(
        member=request.user, workspace__slug=slug, role=ROLE.ADMIN.value, is_active=True
    ).exists()


def _log_timesheet_activity(period, actor_id, slug, verb, old_status=None, comment=""):
    IssueActivity.objects.create(
        issue=None,
        project_id=period.project_id,
        workspace_id=period.workspace_id,
        actor_id=actor_id,
        verb=verb,
        field="timesheet_period",
        old_value=old_status,
        new_value=period.status,
        new_identifier=period.id,
        comment=comment,
        epoch=int(timezone.now().timestamp()),
    )
    # Webhook - see Webhook.timesheet_period / webhook_task.SERIALIZER_MAPPER
    # ["timesheet_period"] (exposes submitted/approved/rejected/reopened
    # transitions to external subscribers, same {event, action} shape as
    # every other webhook event in this codebase).
    model_activity.delay(
        model_name="timesheet_period",
        model_id=str(period.id),
        requested_data={"status": period.status},
        current_instance=json.dumps({"status": old_status}, cls=DjangoJSONEncoder) if old_status else None,
        actor_id=actor_id,
        slug=slug,
        origin=None,
    )


class TimesheetPeriodViewSet(BaseViewSet):
    serializer_class = TimesheetPeriodSerializer
    model = TimesheetPeriod
    filterset_fields = ["logged_by__id", "status"]

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "logged_by", "approved_by")
        )
        project = Project.objects.filter(pk=self.kwargs.get("project_id")).first()
        if project and not _is_approver_or_admin(self.request, self.kwargs.get("slug"), project):
            # Exigence 9 - members without approval rights only ever see
            # their own periods.
            qs = qs.filter(logged_by=self.request.user)
        return qs.distinct()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        queryset = self.get_queryset()
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda periods: TimesheetPeriodSerializer(periods, many=True).data,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        period = self.get_queryset().filter(pk=pk).first()
        if not period:
            return Response({"error": "The required object does not exist."}, status=status.HTTP_404_NOT_FOUND)
        return Response(TimesheetPeriodSerializer(period).data, status=status.HTTP_200_OK)


class TimesheetPeriodSubmitEndpoint(BaseAPIView):
    """
    POST .../timesheet-periods/submit/ - creates the TimesheetPeriod if
    needed, or transitions draft -> submitted (exigence 2). Requires at
    least one IssueWorklog for the requesting user in the given range.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id):
        period_start = request.data.get("period_start")
        period_end = request.data.get("period_end")
        if not period_start or not period_end:
            return Response(
                {"error": "period_start and period_end are required."}, status=status.HTTP_400_BAD_REQUEST
            )

        project = Project.objects.select_related("workspace").get(pk=project_id, workspace__slug=slug)
        # Exigence 11 - approval workflow requires both the per-project
        # time tracking flag AND the workspace-level opt-in.
        if not project.is_time_tracking_enabled or not project.workspace.timesheet_approval_enabled:
            return Response(
                {"error": "The timesheet approval workflow is not enabled for this project/workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        worklog_exists = IssueWorklog.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            logged_by=request.user,
            logged_at__gte=period_start,
            logged_at__lte=period_end,
        ).exists()
        if not worklog_exists:
            return Response(
                {"error": "No worklog entries exist for this period."}, status=status.HTTP_400_BAD_REQUEST
            )

        period, _ = TimesheetPeriod.objects.get_or_create(
            project=project,
            logged_by=request.user,
            period_start=period_start,
            period_end=period_end,
            defaults={"status": "draft"},
        )

        if period.status not in ("draft", "rejected"):
            return Response(
                {"error": f"Cannot submit a timesheet period in status '{period.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = period.status
        period.status = "submitted"
        period.submitted_at = timezone.now()
        period.rejection_reason = ""
        period.save(update_fields=["status", "submitted_at", "rejection_reason"])

        # Exigence 2 - submitting locks the included worklog entries.
        IssueWorklog.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            logged_by=request.user,
            logged_at__gte=period_start,
            logged_at__lte=period_end,
        ).update(timesheet_period=period)

        _log_timesheet_activity(period, request.user.id, slug, "submitted", old_status=old_status)

        return Response(TimesheetPeriodSerializer(period).data, status=status.HTTP_200_OK)


class TimesheetPeriodApproveEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        if not _is_approver_or_admin(request, slug, project):
            return Response(
                {"error": "Only the project lead or a workspace Admin can approve timesheets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        period = TimesheetPeriod.objects.get(pk=pk, workspace__slug=slug, project_id=project_id)
        if period.status != "submitted":
            return Response(
                {"error": f"Cannot approve a timesheet period in status '{period.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = period.status
        period.status = "approved"
        period.approved_by = request.user
        period.approved_at = timezone.now()
        period.save(update_fields=["status", "approved_by", "approved_at"])

        _log_timesheet_activity(period, request.user.id, slug, "approved", old_status=old_status)

        return Response(TimesheetPeriodSerializer(period).data, status=status.HTTP_200_OK)


class TimesheetPeriodRejectEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        if not _is_approver_or_admin(request, slug, project):
            return Response(
                {"error": "Only the project lead or a workspace Admin can reject timesheets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        rejection_reason = request.data.get("rejection_reason", "").strip()
        if not rejection_reason:
            return Response({"error": "rejection_reason is required."}, status=status.HTTP_400_BAD_REQUEST)

        period = TimesheetPeriod.objects.get(pk=pk, workspace__slug=slug, project_id=project_id)
        if period.status != "submitted":
            return Response(
                {"error": f"Cannot reject a timesheet period in status '{period.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = period.status
        period.status = "rejected"
        period.rejection_reason = rejection_reason
        period.save(update_fields=["status", "rejection_reason"])

        # Exigence 5 - a rejected period automatically returns to draft as
        # soon as one of its worklog entries is edited (see
        # IssueWorklogViewSet.partial_update); until then it stays
        # `rejected` so the member sees the reason without losing it.
        _log_timesheet_activity(
            period, request.user.id, slug, "rejected", old_status=old_status, comment=rejection_reason
        )

        return Response(TimesheetPeriodSerializer(period).data, status=status.HTTP_200_OK)


class TimesheetPeriodWithdrawEndpoint(BaseAPIView):
    """
    POST .../timesheet-periods/<id>/withdraw/ - exigence 6, author-only,
    only while still `submitted` (not yet `approved`).
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        period = TimesheetPeriod.objects.get(pk=pk, workspace__slug=slug, project_id=project_id)
        if period.logged_by_id != request.user.id:
            return Response(
                {"error": "Only the author can withdraw their own timesheet period."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if period.status != "submitted":
            return Response(
                {"error": f"Cannot withdraw a timesheet period in status '{period.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = period.status
        period.status = "draft"
        period.submitted_at = None
        period.save(update_fields=["status", "submitted_at"])

        IssueWorklog.objects.filter(timesheet_period=period).update(timesheet_period=None)

        _log_timesheet_activity(period, request.user.id, slug, "reopened", old_status=old_status)

        return Response(TimesheetPeriodSerializer(period).data, status=status.HTTP_200_OK)
