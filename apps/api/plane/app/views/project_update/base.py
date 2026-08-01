# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectUpdateSerializer, ProjectUpdateWriteSerializer
from plane.bgtasks.project_update_task import cadence_timedelta, notify_project_update_published
from plane.db.models import Project, ProjectUpdate
from plane.utils.project_update_summary import generate_project_update_summary
from ..base import BaseAPIView, BaseViewSet


class ProjectUpdateViewSet(BaseViewSet):
    serializer_class = ProjectUpdateSerializer
    model = ProjectUpdate

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .select_related("created_by")
        )
        status_filter = self.request.GET.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset.order_by("-created_at")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        updates = self.get_queryset()
        return self.paginate(
            order_by=request.GET.get("order_by", "-created_at"),
            request=request,
            queryset=updates,
            on_results=lambda data: ProjectUpdateSerializer(data, many=True).data,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        update = self.get_queryset().filter(pk=pk).first()
        if update is None:
            return Response({"error": "Project update not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProjectUpdateSerializer(update).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if project.archived_at is not None:
            return Response(
                {"error": "Archived projects cannot receive new updates"}, status=status.HTTP_400_BAD_REQUEST
            )

        if not request.data.get("status"):
            return Response({"error": "status is required"}, status=status.HTTP_400_BAD_REQUEST)

        last_update = ProjectUpdate.objects.filter(project=project).order_by("-created_at").first()
        since = last_update.created_at if last_update else project.created_at
        generated_summary = generate_project_update_summary(project, since)

        payload = dict(request.data)
        payload.setdefault("generated_summary_json", generated_summary)

        serializer = ProjectUpdateWriteSerializer(data=payload)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        project_update = serializer.save(
            project=project, workspace=project.workspace, created_by=request.user, updated_by=request.user
        )

        cadence_delta = cadence_timedelta(project.update_cadence)
        if cadence_delta is not None:
            project.next_update_due_at = timezone.now() + cadence_delta
            project.save(update_fields=["next_update_due_at"])

        notify_project_update_published.delay(str(project_update.id))

        return Response(ProjectUpdateSerializer(project_update).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def partial_update(self, request, slug, project_id, pk):
        project_update = ProjectUpdate.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if project_update is None:
            return Response({"error": "Project update not found"}, status=status.HTTP_404_NOT_FOUND)

        is_admin = self._is_project_admin(request, slug, project_id)
        if project_update.created_by_id != request.user.id and not is_admin:
            return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)

        # Editing never regenerates the frozen auto-summary snapshot
        # (exigence 6) unless the caller explicitly edits it.
        data = {k: v for k, v in request.data.items() if k != "generated_summary_json"}
        if "generated_summary_json" in request.data:
            data["generated_summary_json"] = request.data["generated_summary_json"]
            data["is_summary_edited"] = True

        serializer = ProjectUpdateWriteSerializer(project_update, data=data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(updated_by=request.user)

        project_update = ProjectUpdate.objects.filter(pk=project_update.pk).first()
        return Response(ProjectUpdateSerializer(project_update).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def destroy(self, request, slug, project_id, pk):
        project_update = ProjectUpdate.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if project_update is None:
            return Response(status=status.HTTP_204_NO_CONTENT)

        is_admin = self._is_project_admin(request, slug, project_id)
        if project_update.created_by_id != request.user.id and not is_admin:
            return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)

        project_update.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _is_project_admin(self, request, slug, project_id):
        from plane.db.models import ProjectMember

        return ProjectMember.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()


class ProjectUpdateLatestEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        update = (
            ProjectUpdate.objects.filter(workspace__slug=slug, project_id=project_id)
            .select_related("created_by")
            .order_by("-created_at")
            .first()
        )
        if update is None:
            return Response(None, status=status.HTTP_200_OK)
        return Response(ProjectUpdateSerializer(update).data, status=status.HTTP_200_OK)


class ProjectUpdateGenerateSummaryEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        last_update = ProjectUpdate.objects.filter(project=project).order_by("-created_at").first()
        since = last_update.created_at if last_update else project.created_at
        summary = generate_project_update_summary(project, since)
        return Response(summary, status=status.HTTP_200_OK)
