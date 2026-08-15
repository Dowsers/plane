# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Token-authenticated (plane.api, mounted at /api/v1/) Figma endpoints -
"the backend API surface the Figma plugin would call against" per
docs/feature-specs/07-integrations-git.md ("4. Plugin Figma", exigence 3:
"utilisateur authentifie (token API personnel Plane)") in plane-selfhost.
Building the actual plugin (canvas UI, useSyncedState widget) is
explicitly out of scope - see the spec's own framing (a separate runtime
outside this monorepo) and docker/api/figma-integration/README.md.
"""

from django.db import IntegrityError, transaction

from rest_framework import status
from rest_framework.response import Response

from plane.api.serializers import FigmaFileLinkCreateSerializer, FigmaFileLinkSerializer
from plane.app.permissions import ProjectEntityPermission
from plane.bgtasks.webhook_task import webhook_activity
from plane.db.models import FigmaFileLink, Issue, IssueActivity
from plane.utils.exception_logger import log_exception
from plane.utils.figma_client import FigmaAPIError, get_images

from .base import BaseAPIView


def _dispatch_figma_webhook(file_link, verb, request):
    try:
        webhook_activity.delay(
            event="figma_link",
            verb=verb,
            field=None,
            old_value=None,
            new_value=None,
            actor_id=str(request.user.id),
            slug=file_link.workspace.slug,
            current_site=None,
            event_id=str(file_link.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={
                "id": str(file_link.id),
                "issue_id": str(file_link.issue_id),
                "figma_file_key": file_link.figma_file_key,
                "figma_node_id": file_link.figma_node_id,
                "url": file_link.url,
            },
        )
    except Exception as e:
        log_exception(e, warning=True)


class FigmaFileLinkListCreateAPIEndpoint(BaseAPIView):
    """Work item <-> Figma frame link list/create - exigences 3-5, 9."""

    serializer_class = FigmaFileLinkSerializer
    model = FigmaFileLink
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            FigmaFileLink.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(project__archived_at__isnull=True)
            .order_by("-created_at")
            .distinct()
        )

    def get(self, request, slug, project_id, issue_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda links: FigmaFileLinkSerializer(links, many=True).data,
        )

    def post(self, request, slug, project_id, issue_id):
        serializer = FigmaFileLinkCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        issue = Issue.objects.filter(pk=issue_id, project_id=project_id).first()
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            with transaction.atomic():
                file_link = FigmaFileLink.objects.create(
                    project_id=project_id,
                    workspace_id=issue.workspace_id,
                    issue_id=issue_id,
                    created_by=request.user,
                    **serializer.validated_data,
                )
        except IntegrityError:
            # Exigence 4 - the DB's own partial unique constraint
            # (unique_active_figma_sync_target) is the actual race-safe
            # source of truth; this converts a constraint violation into
            # the spec's documented 409 shape rather than a generic 400.
            conflict = FigmaFileLink.objects.filter(
                workspace_id=issue.workspace_id,
                figma_file_key=serializer.validated_data.get("figma_file_key"),
                figma_node_id=serializer.validated_data.get("figma_node_id"),
                sync_status_enabled=True,
            ).select_related("issue", "issue__project").first()
            other = f"{conflict.issue.project.identifier}-{conflict.issue.sequence_id}" if conflict else "another issue"
            return Response(
                {"error": f"This frame is already synced with {other}"}, status=status.HTTP_409_CONFLICT
            )

        IssueActivity.objects.create(
            issue_id=issue_id,
            project_id=project_id,
            workspace_id=issue.workspace_id,
            actor=request.user,
            verb="created",
            field="figma_link",
            new_value=file_link.url,
            comment=f"linked a Figma frame: {file_link.figma_node_name or file_link.figma_file_name or file_link.url}",
        )
        _dispatch_figma_webhook(file_link, "created", request)

        return Response(FigmaFileLinkSerializer(file_link).data, status=status.HTTP_201_CREATED)


class FigmaFileLinkDetailAPIEndpoint(BaseAPIView):
    """Retrieve/update (toggle sync, refresh thumbnail)/delete a Figma
    link - exigences 4, 9, 11."""

    serializer_class = FigmaFileLinkSerializer
    model = FigmaFileLink
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        return FigmaFileLink.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
            issue_id=self.kwargs.get("issue_id"),
        )

    def get(self, request, slug, project_id, issue_id, pk):
        file_link = self.get_queryset().filter(pk=pk).first()
        if file_link is None:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(FigmaFileLinkSerializer(file_link).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, project_id, issue_id, pk):
        file_link = self.get_queryset().filter(pk=pk).first()
        if file_link is None:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)

        if "sync_status_enabled" in request.data and request.data["sync_status_enabled"]:
            conflict = (
                FigmaFileLink.objects.filter(
                    workspace_id=file_link.workspace_id,
                    figma_file_key=file_link.figma_file_key,
                    figma_node_id=file_link.figma_node_id,
                    sync_status_enabled=True,
                )
                .exclude(pk=file_link.pk)
                .select_related("issue", "issue__project")
                .first()
            )
            if conflict is not None:
                other = f"{conflict.issue.project.identifier}-{conflict.issue.sequence_id}"
                return Response(
                    {"error": f"This frame is already synced with {other}"}, status=status.HTTP_409_CONFLICT
                )

        if request.data.get("refresh_thumbnail") and file_link.figma_node_id:
            from plane.db.models import FigmaWorkspaceConnection

            connection = FigmaWorkspaceConnection.objects.filter(
                workspace_id=file_link.workspace_id, is_active=True
            ).first()
            if connection is not None:
                try:
                    images = get_images(connection.access_token, file_link.figma_file_key, [file_link.figma_node_id])
                    thumbnail = (images.get("images") or {}).get(file_link.figma_node_id)
                    if thumbnail:
                        file_link.thumbnail_url = thumbnail
                except FigmaAPIError as e:
                    file_link.last_sync_error = str(e)

        for field in ("sync_status_enabled", "figma_file_name", "figma_node_name", "thumbnail_url"):
            if field in request.data:
                setattr(file_link, field, request.data[field])
        try:
            with transaction.atomic():
                file_link.save()
        except IntegrityError:
            # Defense-in-depth against the race between the pre-check
            # above and this save (a concurrent request could activate a
            # conflicting sync in between) - same DB constraint, same 409
            # shape as the create path.
            conflict = (
                FigmaFileLink.objects.filter(
                    workspace_id=file_link.workspace_id,
                    figma_file_key=file_link.figma_file_key,
                    figma_node_id=file_link.figma_node_id,
                    sync_status_enabled=True,
                )
                .exclude(pk=file_link.pk)
                .select_related("issue", "issue__project")
                .first()
            )
            other = f"{conflict.issue.project.identifier}-{conflict.issue.sequence_id}" if conflict else "another issue"
            return Response({"error": f"This frame is already synced with {other}"}, status=status.HTTP_409_CONFLICT)
        return Response(FigmaFileLinkSerializer(file_link).data, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, issue_id, pk):
        file_link = self.get_queryset().filter(pk=pk).first()
        if file_link is None:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)

        frame_label = file_link.figma_node_name or file_link.figma_file_name or file_link.url
        IssueActivity.objects.create(
            issue_id=issue_id,
            project_id=project_id,
            workspace_id=file_link.workspace_id,
            actor=request.user,
            verb="deleted",
            field="figma_link",
            old_value=file_link.url,
            comment=f"unlinked a Figma frame: {frame_label}",
        )
        _dispatch_figma_webhook(file_link, "deleted", request)
        file_link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FigmaStatusBatchAPIEndpoint(BaseAPIView):
    """
    `GET /figma/status-batch/?issue_ids=...` for the canvas widget
    (exigence per "Considerations API/UX"). PERMISSION SCOPING (exigence
    14 - "en respectant la visibilite projet privee/publique existante"):
    filters to only issues in projects where the requesting token's user
    is an ACTIVE project member - an issue_id for a project the caller
    isn't a member of is silently omitted from the response (not a 403
    for the whole batch), since a single widget call legitimately mixes
    issue ids from several frames on a page, some of which the viewer may
    not have access to.
    """

    def get(self, request, slug):
        issue_ids = [i for i in (request.GET.get("issue_ids") or "").split(",") if i]
        if not issue_ids:
            return Response({}, status=status.HTTP_200_OK)

        issues = (
            Issue.objects.filter(
                id__in=issue_ids,
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("state")
            .distinct()
        )

        result = {}
        for issue in issues:
            if issue.state is None:
                continue
            result[str(issue.id)] = {
                "name": issue.state.name,
                "group": issue.state.group,
                "color": issue.state.color,
            }
        return Response(result, status=status.HTTP_200_OK)
