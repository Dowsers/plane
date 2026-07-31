# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Count, Q, UUIDField, Value
from django.db.models.functions import Coalesce

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import InitiativeSerializer, InitiativeWriteSerializer
from plane.db.models import Initiative, InitiativeActivity, Workspace, WorkspaceMember
from ..base import BaseViewSet

WRITABLE_FIELDS = [
    "name",
    "description",
    "description_html",
    "status",
    "lead_id",
    "start_date",
    "target_date",
    "logo_props",
]


def _log_activity(initiative, actor, verb, field=None, old_value=None, new_value=None):
    InitiativeActivity.objects.create(
        initiative=initiative,
        workspace_id=initiative.workspace_id,
        actor=actor,
        verb=verb,
        field=field,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
    )


class InitiativeViewSet(BaseViewSet):
    serializer_class = InitiativeSerializer
    model = Initiative

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .annotate(
                total_projects=Count(
                    "project_links__project__id",
                    distinct=True,
                    filter=Q(
                        project_links__deleted_at__isnull=True,
                        project_links__project__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                total_issues=Count(
                    "project_links__project__project_issue__id",
                    distinct=True,
                    filter=Q(
                        project_links__deleted_at__isnull=True,
                        project_links__project__deleted_at__isnull=True,
                        project_links__project__project_issue__archived_at__isnull=True,
                        project_links__project__project_issue__is_draft=False,
                        project_links__project__project_issue__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                completed_issues=Count(
                    "project_links__project__project_issue__id",
                    distinct=True,
                    filter=Q(
                        project_links__deleted_at__isnull=True,
                        project_links__project__deleted_at__isnull=True,
                        project_links__project__project_issue__state__group="completed",
                        project_links__project__project_issue__archived_at__isnull=True,
                        project_links__project__project_issue__is_draft=False,
                        project_links__project__project_issue__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                project_ids=Coalesce(
                    ArrayAgg(
                        "project_links__project_id",
                        distinct=True,
                        filter=Q(project_links__deleted_at__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .order_by("sort_order", "-created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        initiatives = self.get_queryset()
        return Response(InitiativeSerializer(initiatives, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        initiative = self.get_queryset().filter(pk=pk).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(InitiativeSerializer(initiative).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        serializer = InitiativeWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        initiative = serializer.save(workspace=workspace, created_by=request.user, updated_by=request.user)
        _log_activity(initiative, request.user, "created")

        initiative = self.get_queryset().filter(pk=initiative.pk).first()
        return Response(InitiativeSerializer(initiative).data, status=status.HTTP_201_CREATED)

    def _can_modify(self, request, slug, initiative):
        if initiative.lead_id is not None and str(initiative.lead_id) == str(request.user.id):
            return True
        return WorkspaceMember.objects.filter(
            member=request.user,
            workspace__slug=slug,
            is_active=True,
            role=ROLE.ADMIN.value,
        ).exists()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        initiative = Initiative.objects.filter(workspace__slug=slug, pk=pk).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        if not self._can_modify(request, slug, initiative):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        before = {field: getattr(initiative, field) for field in WRITABLE_FIELDS}

        serializer = InitiativeWriteSerializer(initiative, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        initiative = serializer.save(updated_by=request.user)

        for field in WRITABLE_FIELDS:
            if field in request.data and before[field] != getattr(initiative, field):
                _log_activity(
                    initiative,
                    request.user,
                    "updated",
                    field=field,
                    old_value=before[field],
                    new_value=getattr(initiative, field),
                )

        initiative = self.get_queryset().filter(pk=initiative.pk).first()
        return Response(InitiativeSerializer(initiative).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        initiative = Initiative.objects.filter(workspace__slug=slug, pk=pk).first()
        if initiative is not None:
            initiative.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
