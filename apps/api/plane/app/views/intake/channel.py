# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView, BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    IntakeChannelSerializer,
    SlackWorkspaceConnectionSerializer,
    SlackChannelProjectMappingSerializer,
)
from plane.db.models import (
    InboundEmailAlias,
    IntakeChannel,
    Project,
    SlackChannelProjectMapping,
    SlackWorkspaceConnection,
)
from plane.db.models.intake_channel import get_email_alias_local_part


class IntakeChannelViewSet(BaseViewSet):
    """
    Authenticated CRUD for a project's omnichannel intake channels
    (email/Slack) - see docs/feature-specs/02-cycles-intake.md ("Intake
    omnicanal (email + Slack-to-issue)") in plane-selfhost. This is a
    SKELETON feature - see
    docker/api/omnichannel-intake-skeleton/README.md for what's real vs
    stubbed.
    """

    serializer_class = IntakeChannelSerializer
    model = IntakeChannel

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .select_related("email_alias")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id):
        serializer = self.serializer_class(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        channel_type = request.data.get("channel_type")
        if channel_type not in dict(IntakeChannel.CHANNEL_TYPE_CHOICES):
            return Response({"error": "Invalid channel_type"}, status=status.HTTP_400_BAD_REQUEST)

        if (
            channel_type == "EMAIL"
            and IntakeChannel.objects.filter(project_id=project_id, channel_type="EMAIL", is_enabled=True).exists()
        ):
            return Response(
                {"error": "This project already has an active email channel"}, status=status.HTTP_400_BAD_REQUEST
            )

        channel = IntakeChannel.objects.create(
            project_id=project_id,
            workspace_id=project.workspace_id,
            channel_type=channel_type,
            config=request.data.get("config", {}),
        )
        if channel_type == "EMAIL":
            InboundEmailAlias.objects.create(
                intake_channel=channel, project_id=project_id, workspace_id=project.workspace_id
            )

        channel = self.get_queryset().filter(pk=channel.pk).first()
        return Response(self.serializer_class(channel).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        channel = self.get_queryset().filter(pk=pk).first()
        if channel is None:
            return Response({"error": "Channel not found"}, status=status.HTTP_404_NOT_FOUND)

        if "is_enabled" in request.data:
            channel.is_enabled = request.data["is_enabled"]
        if "config" in request.data:
            channel.config = request.data["config"]
        channel.save()

        channel = self.get_queryset().filter(pk=pk).first()
        return Response(self.serializer_class(channel).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        channel = self.get_queryset().filter(pk=pk).first()
        if channel is not None:
            channel.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IntakeChannelEmailRegenerateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id, pk):
        channel = IntakeChannel.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk, channel_type="EMAIL"
        ).first()
        if channel is None:
            return Response({"error": "Email channel not found"}, status=status.HTTP_404_NOT_FOUND)

        alias = getattr(channel, "email_alias", None)
        if alias is None:
            return Response({"error": "This channel has no email alias"}, status=status.HTTP_400_BAD_REQUEST)

        # Old alias stops resolving immediately, same pattern as
        # IntakeForm.token regeneration (docker/api/public-intake-form).
        alias.local_part = get_email_alias_local_part()
        alias.save(update_fields=["local_part"])
        return Response({"full_address": alias.full_address}, status=status.HTTP_200_OK)


class SlackWorkspaceConnectionEndpoint(BaseAPIView):
    """
    Read/disconnect only in this skeleton - there is no working OAuth
    initiation flow (POST .../connect/) since that requires a real Slack
    app client_id/secret to be registered for this instance. See README.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        connection = SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is None:
            return Response({"connected": False}, status=status.HTTP_200_OK)
        return Response(
            {"connected": True, **SlackWorkspaceConnectionSerializer(connection).data}, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug):
        connection = SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is not None:
            connection.is_active = False
            connection.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlackWorkspaceConnectEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        return Response(
            {
                "error": (
                    "Slack OAuth is not implemented in this skeleton iteration - it requires a real Slack "
                    "app (client_id/secret) registered for this instance. See "
                    "docker/api/omnichannel-intake-skeleton/README.md."
                )
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )


class SlackChannelProjectMappingViewSet(BaseViewSet):
    serializer_class = SlackChannelProjectMappingSerializer
    model = SlackChannelProjectMapping

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id):
        serializer = self.serializer_class(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        connection = SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is None:
            return Response({"error": "No active Slack connection for this workspace"}, status=status.HTTP_400_BAD_REQUEST)

        mapping = SlackChannelProjectMapping.objects.create(
            project_id=project_id,
            workspace_id=project.workspace_id,
            slack_connection=connection,
            slack_channel_id=request.data.get("slack_channel_id"),
            is_default_for_dm=request.data.get("is_default_for_dm", False),
        )
        return Response(self.serializer_class(mapping).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        mapping = self.get_queryset().filter(pk=pk).first()
        if mapping is not None:
            mapping.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
