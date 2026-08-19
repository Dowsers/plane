# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Endpoints for category 9 (AI features, docs/feature-specs/09-ai-features.md
in plane-selfhost), feature 5 - "Digest periodique automatise". See
`plane.db.models.digest` for the models, `plane.utils.digest_content` for
content aggregation/rendering, and `plane.bgtasks.digest_task` for
scheduling/generation/delivery.

`GET`/`PATCH .../users/me/digest-preferences/` - the requesting user's own
  preference row for this workspace, created on first access (matches this
  fork's `WorkspaceAPIExplorerSettings`/`WorkspaceQuerySettings`
  "get_or_create settings row" convention). Any active workspace member
  (Admin/Member/Guest) - this is a personal setting, not an admin one.
`GET .../users/me/digests/` - the user's own paginated digest history.
`GET .../users/me/digests/<pk>/` - detail with grouped items.
`POST .../users/me/digests/preview/` - immediate synchronous test
  generation+send (exigence 15), rate-limited.
`GET`/`PATCH .../digest-settings/` - Admin-only workspace kill-switch/LLM
  enrichment toggle (exigence 13), same GET-Admin/Member-PATCH-Admin-only
  shape as `WorkspaceAPIExplorerSettingsEndpoint`.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    DigestPreferenceSerializer,
    DigestRunDetailSerializer,
    DigestRunSerializer,
    WorkspaceDigestSettingsSerializer,
)
from plane.bgtasks.digest_task import generate_preview_digest
from plane.db.models import DigestPreference, DigestRun, DigestRunStatus, Project, Workspace
from plane.throttles.digest import DigestPreviewThrottle

from .base import BaseAPIView


def _get_or_create_preference(user, workspace):
    preference, _ = DigestPreference.objects.get_or_create(user=user, workspace=workspace)
    return preference


class UserDigestPreferenceEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        preference = _get_or_create_preference(request.user, workspace)
        return Response(DigestPreferenceSerializer(preference).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        preference = _get_or_create_preference(request.user, workspace)

        custom_project_ids = request.data.get("custom_projects")
        if custom_project_ids is not None:
            requested_ids = {str(pid) for pid in custom_project_ids}
            valid_ids = {
                str(pid)
                for pid in Project.objects.filter(workspace=workspace, pk__in=custom_project_ids).values_list(
                    "id", flat=True
                )
            }
            if requested_ids - valid_ids:
                return Response(
                    {"error": "custom_projects must belong to this workspace."}, status=status.HTTP_400_BAD_REQUEST
                )

        serializer = DigestPreferenceSerializer(preference, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        if custom_project_ids is not None:
            preference.custom_projects.set(custom_project_ids)

        return Response(DigestPreferenceSerializer(preference).data, status=status.HTTP_200_OK)


class UserDigestListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        queryset = DigestRun.objects.filter(user=request.user, workspace=workspace).order_by("-period_end")
        return self.paginate(
            request=request, queryset=queryset, on_results=lambda data: DigestRunSerializer(data, many=True).data
        )


class UserDigestDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk):
        digest_run = (
            DigestRun.objects.filter(user=request.user, workspace__slug=slug, pk=pk)
            .prefetch_related("items")
            .first()
        )
        if digest_run is None:
            return Response({"error": "Digest not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(DigestRunDetailSerializer(digest_run).data, status=status.HTTP_200_OK)


class UserDigestPreviewEndpoint(BaseAPIView):
    """`POST .../users/me/digests/preview/` (exigence 15) - synchronous
    (the whole point is "right now" feedback), using the user's current
    saved preferences. Rate-limited to guard against email-quota abuse.
    """

    throttle_classes = [DigestPreviewThrottle]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        if not workspace.digest_feature_enabled:
            return Response(
                {"error": "The digest feature is disabled for this workspace."}, status=status.HTTP_400_BAD_REQUEST
            )

        preference = _get_or_create_preference(request.user, workspace)
        digest_run = generate_preview_digest(preference)

        if digest_run is None or digest_run.status == DigestRunStatus.SKIPPED_EMPTY:
            return Response(
                {
                    "status": DigestRunStatus.SKIPPED_EMPTY,
                    "message": "No qualifying activity was found for the preview period.",
                },
                status=status.HTTP_200_OK,
            )

        return Response(DigestRunDetailSerializer(digest_run).data, status=status.HTTP_200_OK)


class WorkspaceDigestSettingsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(WorkspaceDigestSettingsSerializer(workspace).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = WorkspaceDigestSettingsSerializer(workspace, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
