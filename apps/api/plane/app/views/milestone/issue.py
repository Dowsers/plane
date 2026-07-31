# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Q, UUIDField, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, Milestone
from ..base import BaseAPIView


class MilestoneAvailableIssuesEndpoint(BaseAPIView):
    """
    Lightweight picker source for the "add issues to milestone" modal -
    project issues not currently attached to ANY milestone (the exclusive
    one-milestone-per-issue constraint makes "unassigned" the natural
    picker scope, rather than building out the full generic issue-list/
    group_by machinery for this one modal).
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        issues = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, milestone_id__isnull=True)
            .order_by("-created_at")
            .values("id", "name", "sequence_id")[:200]
        )
        return Response(list(issues), status=status.HTTP_200_OK)


class MilestoneIssueViewSet(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, milestone_id):
        issues = (
            Issue.issue_objects.filter(
                workspace__slug=slug, project_id=project_id, milestone_id=milestone_id
            )
            .annotate(
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True) & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .order_by("sort_order")
            .values(
                "id",
                "name",
                "sequence_id",
                "state_id",
                "priority",
                "project_id",
                "assignee_ids",
                "start_date",
                "target_date",
            )
        )
        return Response(list(issues), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, milestone_id):
        milestone = Milestone.objects.filter(workspace__slug=slug, project_id=project_id, pk=milestone_id).first()
        if milestone is None:
            return Response({"error": "Milestone not found"}, status=status.HTTP_404_NOT_FOUND)

        issue_ids = request.data.get("issue_ids", [])
        if not isinstance(issue_ids, list) or not issue_ids:
            return Response({"error": "issue_ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        issues = list(
            Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids).exclude(
                milestone_id=milestone_id
            )
        )
        epoch = int(timezone.now().timestamp())
        for issue in issues:
            previous_milestone_id = issue.milestone_id
            issue.milestone_id = milestone_id
            issue.save(update_fields=["milestone_id"])
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps({"milestone": str(milestone_id)}),
                current_instance=json.dumps(
                    {"milestone_id": str(previous_milestone_id) if previous_milestone_id else None}
                ),
                issue_id=str(issue.id),
                actor_id=str(request.user.id),
                project_id=str(project_id),
                epoch=epoch,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, milestone_id, issue_id):
        issue = Issue.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=issue_id, milestone_id=milestone_id
        ).first()
        if issue is not None:
            issue.milestone_id = None
            issue.save(update_fields=["milestone_id"])
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps({"milestone": None}),
                current_instance=json.dumps({"milestone_id": str(milestone_id)}),
                issue_id=str(issue_id),
                actor_id=str(request.user.id),
                project_id=str(project_id),
                epoch=int(timezone.now().timestamp()),
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
