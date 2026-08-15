# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Authenticated Sentry integration endpoints - see
docs/feature-specs/07-integrations-git.md ("5. Integration Sentry
native", "Considerations API / UX") in plane-selfhost.

Exigence 9 - "Seuls les membres avec le rôle Admin du workspace peuvent
créer/modifier/supprimer la connexion Sentry et les mappings projet ; les
Members ont un accès en lecture seule" - both viewsets below gate
write verbs to `ROLE.ADMIN` (level="WORKSPACE") and read verbs to
`ROLE.ADMIN`/`ROLE.MEMBER`.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    IntegrationEventLogSerializer,
    SentryProjectSyncSerializer,
    WorkspaceSentryConnectionSerializer,
)
from plane.db.models import (
    IntegrationEventLog,
    IntegrationProvider,
    SentryProjectSync,
    Workspace,
    WorkspaceSentryConnection,
)
from plane.utils.sentry_client import SentryAPIError, list_org_projects

from ..base import BaseAPIView, BaseViewSet


class SentryConnectionEndpoint(BaseAPIView):
    """`POST` connects (exigence 1), `GET` returns status, `DELETE`
    disconnects (exigence 6/13 - deactivates only, existing issues/links
    stay read-only, nothing is deleted)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        connection = WorkspaceSentryConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is None:
            return Response({"connected": False}, status=status.HTTP_200_OK)
        return Response(
            {"connected": True, **WorkspaceSentryConnectionSerializer(connection).data},
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        api_token = request.data.get("api_token")
        org_slug = request.data.get("sentry_org_slug") or request.data.get("org_slug")
        base_url = request.data.get("sentry_base_url") or request.data.get("base_url") or "https://sentry.io"

        if not api_token or not org_slug:
            return Response({"error": "api_token and sentry_org_slug are required"}, status=status.HTTP_400_BAD_REQUEST)

        # Exigence 1 - "le token est validé par un appel test à l'API
        # Sentry au moment de l'enregistrement, sinon rejet HTTP 400 avec
        # message explicite".
        try:
            list_org_projects(base_url, org_slug, api_token)
        except SentryAPIError as e:
            return Response({"error": f"Sentry validation failed: {e.message}"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        WorkspaceSentryConnection.objects.filter(workspace=workspace, is_active=True).update(is_active=False)
        connection = WorkspaceSentryConnection.objects.create(
            workspace=workspace,
            org_slug=org_slug,
            base_url=base_url,
            api_token=api_token,
            token_last_4=api_token[-4:],
            webhook_secret=request.data.get("webhook_secret", ""),
            is_active=True,
            connected_by=request.user,
            connected_at=timezone.now(),
            last_validated_at=timezone.now(),
        )
        return Response(WorkspaceSentryConnectionSerializer(connection).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug):
        connection = WorkspaceSentryConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is None:
            return Response({"error": "No active Sentry connection"}, status=status.HTTP_404_NOT_FOUND)
        connection.is_active = False
        # Exigence 10 - "faire disparaître le token stocké" on disconnect.
        connection.api_token = ""
        connection.webhook_secret = ""
        connection.save(update_fields=["is_active", "api_token", "webhook_secret"])
        SentryProjectSync.objects.filter(connection=connection, is_active=True).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SentryProjectSyncViewSet(BaseViewSet):
    serializer_class = SentryProjectSyncSerializer
    model = SentryProjectSync

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .select_related("connection", "default_state", "resolved_state", "reopen_state", "label")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug, project_id):
        return Response(SentryProjectSyncSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug, project_id):
        connection = WorkspaceSentryConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is None:
            return Response({"error": "Connect Sentry to this workspace first"}, status=status.HTTP_400_BAD_REQUEST)
        if not request.data.get("sentry_project_slug"):
            return Response({"error": "sentry_project_slug is required"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = SentryProjectSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(project_id=project_id, connection=connection)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, project_id, pk):
        instance = self.get_queryset().filter(pk=pk).first()
        if instance is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = SentryProjectSyncSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, project_id, pk):
        # Exigence 13 - deletion doesn't retroactively delete already-
        # created issues; only the sync mapping is torn down (and its
        # linked IssueSentryDetail rows are flipped read-only by the
        # is_sync_active guard the outbound task and inbound webhook both
        # already check).
        instance = self.get_queryset().filter(pk=pk).first()
        if instance is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        instance.issue_details.update(is_sync_active=False)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SentryIntegrationLogsEndpoint(BaseAPIView):
    """Exigence 8 - "consultable par les admins dans Paramètres >
    Intégrations > Sentry > Journal, conservé 30 jours" (retention itself
    is enforced by `plane.bgtasks.integration_log_retention_task`)."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        logs = IntegrationEventLog.objects.filter(
            workspace__slug=slug, provider=IntegrationProvider.SENTRY
        ).order_by("-created_at")[:200]
        return Response(IntegrationEventLogSerializer(logs, many=True).data, status=status.HTTP_200_OK)
