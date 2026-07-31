# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Count, Min, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import InitiativeProjectSerializer
from plane.db.models import Initiative, InitiativeProject, Project, WorkspaceMember
from plane.utils.initiative_health import recalculate_initiative_health
from ..base import BaseAPIView
from .base import _log_activity


def _is_admin_or_lead(request, slug, initiative):
    if initiative.lead_id is not None and str(initiative.lead_id) == str(request.user.id):
        return True
    return WorkspaceMember.objects.filter(
        member=request.user,
        workspace__slug=slug,
        is_active=True,
        role=ROLE.ADMIN.value,
    ).exists()


class InitiativeProjectViewSet(BaseAPIView):
    def get_links(self, slug, initiative_id):
        return (
            InitiativeProject.objects.filter(
                workspace__slug=slug, initiative_id=initiative_id, initiative__deleted_at__isnull=True
            )
            .annotate(
                total_issues=Count(
                    "project__project_issue__id",
                    distinct=True,
                    filter=Q(
                        project__project_issue__archived_at__isnull=True,
                        project__project_issue__is_draft=False,
                        project__project_issue__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                completed_issues=Count(
                    "project__project_issue__id",
                    distinct=True,
                    filter=Q(
                        project__project_issue__state__group="completed",
                        project__project_issue__archived_at__isnull=True,
                        project__project_issue__is_draft=False,
                        project__project_issue__deleted_at__isnull=True,
                    ),
                )
            )
            .order_by("sort_order", "-created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, initiative_id):
        links = self.get_links(slug, initiative_id)
        return Response(InitiativeProjectSerializer(links, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, initiative_id):
        initiative = Initiative.objects.filter(workspace__slug=slug, pk=initiative_id).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _is_admin_or_lead(request, slug, initiative):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        project_ids = request.data.get("project_ids", [])
        if not isinstance(project_ids, list) or not project_ids:
            return Response({"error": "project_ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        # Same-workspace validation - silently drop any id that isn't a real
        # project of this workspace rather than failing the whole request.
        valid_project_ids = set(
            str(pid)
            for pid in Project.objects.filter(workspace__slug=slug, pk__in=project_ids).values_list("id", flat=True)
        )
        already_linked_ids = set(
            str(pid)
            for pid in InitiativeProject.objects.filter(
                initiative=initiative, project_id__in=project_ids, deleted_at__isnull=True
            ).values_list("project_id", flat=True)
        )
        to_link_ids = [pid for pid in valid_project_ids if pid not in already_linked_ids]

        if to_link_ids:
            smallest_sort_order = (
                InitiativeProject.objects.filter(initiative=initiative).aggregate(smallest=Min("sort_order"))[
                    "smallest"
                ]
                or 65535
            )
            InitiativeProject.objects.bulk_create(
                [
                    InitiativeProject(
                        initiative=initiative,
                        project_id=project_id,
                        workspace_id=initiative.workspace_id,
                        sort_order=smallest_sort_order - ((index + 1) * 10000),
                        created_by=request.user,
                        updated_by=request.user,
                    )
                    for index, project_id in enumerate(to_link_ids)
                ]
            )
            recalculate_initiative_health(initiative.id)
            _log_activity(
                initiative,
                request.user,
                "linked",
                field="project",
                new_value=", ".join(to_link_ids),
            )

        links = self.get_links(slug, initiative_id)
        return Response(InitiativeProjectSerializer(links, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug, initiative_id, project_id):
        initiative = Initiative.objects.filter(workspace__slug=slug, pk=initiative_id).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _is_admin_or_lead(request, slug, initiative):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        link = InitiativeProject.objects.filter(initiative=initiative, project_id=project_id).first()
        if link is not None:
            link.delete()
            recalculate_initiative_health(initiative.id)
            _log_activity(initiative, request.user, "unlinked", field="project", old_value=str(project_id))

        return Response(status=status.HTTP_204_NO_CONTENT)
