# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.db.models import Count, Q
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import MilestoneSerializer, MilestoneWriteSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, Milestone
from ..base import BaseAPIView, BaseViewSet


class MilestoneViewSet(BaseViewSet):
    serializer_class = MilestoneSerializer
    model = Milestone

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .annotate(
                total_issues=Count(
                    "issue_milestone__id",
                    distinct=True,
                    filter=Q(
                        issue_milestone__archived_at__isnull=True,
                        issue_milestone__is_draft=False,
                        issue_milestone__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                completed_issues=Count(
                    "issue_milestone__id",
                    distinct=True,
                    filter=Q(
                        issue_milestone__state__group="completed",
                        issue_milestone__archived_at__isnull=True,
                        issue_milestone__is_draft=False,
                        issue_milestone__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                cancelled_issues=Count(
                    "issue_milestone__id",
                    distinct=True,
                    filter=Q(
                        issue_milestone__state__group="cancelled",
                        issue_milestone__archived_at__isnull=True,
                        issue_milestone__is_draft=False,
                        issue_milestone__deleted_at__isnull=True,
                    ),
                )
            )
            .order_by("sort_order", "-created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        milestones = self.get_queryset()
        return Response(MilestoneSerializer(milestones, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        milestone = self.get_queryset().filter(pk=pk).first()
        if milestone is None:
            return Response({"error": "Milestone not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(MilestoneSerializer(milestone).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        serializer = MilestoneWriteSerializer(data=request.data, context={"project_id": project_id})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        milestone = serializer.save(
            project_id=project_id, created_by=request.user, updated_by=request.user
        )

        milestone = self.get_queryset().filter(pk=milestone.pk).first()
        return Response(MilestoneSerializer(milestone).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        milestone = Milestone.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if milestone is None:
            return Response({"error": "Milestone not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = MilestoneWriteSerializer(
            milestone, data=request.data, partial=True, context={"project_id": project_id}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(updated_by=request.user)

        milestone = self.get_queryset().filter(pk=milestone.pk).first()
        return Response(MilestoneSerializer(milestone).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, pk):
        milestone = Milestone.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if milestone is None:
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Snapshot attached issues before soft-deleting the milestone - the
        # generic soft_delete_related_objects task nulls Issue.milestone_id
        # asynchronously (SET_NULL cascade, free), but logs no IssueActivity
        # itself, so that has to happen here explicitly, matching the
        # activity shape track_milestone() would produce for a manual
        # detach - see docs/feature-specs/03-projects-roadmaps-initiatives.md
        # ("Milestones de projet") in plane-selfhost.
        attached_issue_ids = list(
            Issue.objects.filter(milestone=milestone, deleted_at__isnull=True).values_list("id", flat=True)
        )

        milestone.delete()

        epoch = int(timezone.now().timestamp())
        for issue_id in attached_issue_ids:
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps({"milestone": None}),
                current_instance=json.dumps({"milestone_id": str(milestone.id)}),
                issue_id=str(issue_id),
                actor_id=str(request.user.id),
                project_id=str(project_id),
                epoch=epoch,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class MilestoneReorderEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        ordered_ids = request.data.get("milestone_ids", [])
        if not isinstance(ordered_ids, list) or not ordered_ids:
            return Response({"error": "milestone_ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        milestones = {
            str(milestone.id): milestone
            for milestone in Milestone.objects.filter(
                workspace__slug=slug, project_id=project_id, id__in=ordered_ids
            )
        }
        updated = []
        for index, milestone_id in enumerate(ordered_ids):
            milestone = milestones.get(str(milestone_id))
            if milestone is None:
                continue
            milestone.sort_order = (index + 1) * 10000
            updated.append(milestone)

        Milestone.objects.bulk_update(updated, ["sort_order"], batch_size=100)
        return Response(status=status.HTTP_204_NO_CONTENT)
