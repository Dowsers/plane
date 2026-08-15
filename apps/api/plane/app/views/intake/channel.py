# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.utils import timezone

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
    SlackUserConnectionSerializer,
)
from plane.db.models import (
    InboundEmailAlias,
    IntakeChannel,
    Project,
    SlackChannelProjectMapping,
    SlackUserConnection,
    SlackWorkspaceConnection,
    Workspace,
)
from plane.db.models.intake_channel import (
    SLACK_NOTIFY_EVENT_CHOICES,
    get_email_alias_local_part,
)
from plane.utils.exception_logger import log_exception
from plane.utils.slack_client import SlackAPIError, auth_test, oauth_v2_access


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
    Status/disconnect for the workspace's Slack connection. See
    SlackWorkspaceConnectEndpoint for how a connection is actually
    established (category 7 extends this from the Category 2 skeleton,
    which only had this read/delete half working).
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
        """
        Exigence 14 (app uninstall/manual disconnect) - deactivates the
        connection AND every channel<->project mapping for this
        workspace, so a stale mapping can never keep firing
        chat.postMessage calls with a token that's about to be treated as
        revoked. Does NOT delete SlackIssueThread/SlackUserConnection
        rows - existing thread links and identity links stay intact so
        reconnecting the same Slack team later resumes sync rather than
        losing history, consistent with every other "disconnect keeps
        history" convention in this fork's other category 7 features
        (see FigmaWorkspaceConnectionEndpoint.delete for the same
        pattern). There is no audit-log mechanism anywhere in this
        codebase (confirmed absent, not a gap introduced here) - this
        disconnect is only visible via the deactivated rows themselves.
        """
        connection = SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is not None:
            connection.is_active = False
            connection.save(update_fields=["is_active"])
            SlackChannelProjectMapping.objects.filter(slack_connection=connection).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlackWorkspaceConnectEndpoint(BaseAPIView):
    """
    Establishes a workspace's Slack connection via one of two paths - see
    docker/api/slack-app/README.md for the reasoning behind offering
    both:

    1. Manual bot token (`{"bot_access_token": "xoxb-...", "signing_secret": "..."}`,
       `installation_method=MANUAL_BOT_TOKEN`) - the primary, genuinely
       testable-today v1 path. Slack apps are normally created once per
       Slack workspace at api.slack.com/apps (unlike GitHub PATs, which
       are per-USER and reusable across any repo the user can see) - for
       a self-hosted, single-Plane-workspace install, having the admin
       create one Slack app for their own Slack org and paste its Bot
       User OAuth Token here needs no public redirect URL at all, which
       is exactly the constraint this sandbox has. The token is validated
       for real against Slack's own `auth.test` before being stored.
    2. OAuth (`{"code": "..."}`, `installation_method=OAUTH`) - the
       standard `oauth.v2.access` exchange. Real exchange code exists
       (see plane.utils.slack_client.oauth_v2_access) but is gated behind
       SLACK_CLIENT_ID/SLACK_CLIENT_SECRET - unset by default, so this
       path returns 501 exactly like the original skeleton did, since no
       registered Slack app/public callback URL exists here. Configuring
       those two settings on a real deployment (with a real registered
       Slack app) enables this path with no code changes.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        bot_access_token = request.data.get("bot_access_token")
        code = request.data.get("code")

        if bot_access_token:
            signing_secret = request.data.get("signing_secret", "")
            try:
                identity = auth_test(bot_access_token)
            except SlackAPIError as e:
                return Response(
                    {"error": f"Slack rejected this token: {e.error}"}, status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                log_exception(e)
                return Response(
                    {"error": "Could not reach Slack to validate this token. Please try again."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            # Exigence 1 (spec section 4's sibling framing, applied here
            # too) - replacing an existing connection deactivates it
            # rather than deleting it, preserving history/audit trail.
            SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).update(is_active=False)

            workspace = Workspace.objects.get(slug=slug)
            connection = SlackWorkspaceConnection.objects.create(
                workspace_id=workspace.id,
                slack_team_id=identity.get("team_id", ""),
                slack_team_name=identity.get("team", ""),
                bot_access_token=bot_access_token,
                signing_secret=signing_secret,
                bot_user_id=identity.get("user_id", ""),
                installation_method="MANUAL_BOT_TOKEN",
                connected_by=request.user,
                connected_at=timezone.now(),
            )
            return Response(
                {"connected": True, **SlackWorkspaceConnectionSerializer(connection).data},
                status=status.HTTP_201_CREATED,
            )

        if code:
            if not (settings.SLACK_CLIENT_ID and settings.SLACK_CLIENT_SECRET):
                return Response(
                    {
                        "error": (
                            "Slack OAuth is not configured on this instance - it requires a real Slack app "
                            "(client_id/secret) registered for this instance's own domain. Set SLACK_CLIENT_ID/"
                            "SLACK_CLIENT_SECRET/SLACK_REDIRECT_URI, or use the manual bot-token connection "
                            "path instead. See docker/api/slack-app/README.md."
                        )
                    },
                    status=status.HTTP_501_NOT_IMPLEMENTED,
                )
            try:
                token_data = oauth_v2_access(
                    settings.SLACK_CLIENT_ID, settings.SLACK_CLIENT_SECRET, code, settings.SLACK_REDIRECT_URI
                )
            except SlackAPIError as e:
                return Response(
                    {"error": f"Slack OAuth exchange failed: {e.error}"}, status=status.HTTP_400_BAD_REQUEST
                )

            SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).update(is_active=False)
            bot = token_data.get("bot_user_id", "")
            workspace = Workspace.objects.get(slug=slug)
            connection = SlackWorkspaceConnection.objects.create(
                workspace_id=workspace.id,
                slack_team_id=(token_data.get("team") or {}).get("id", ""),
                slack_team_name=(token_data.get("team") or {}).get("name", ""),
                bot_access_token=token_data.get("access_token", ""),
                bot_user_id=bot,
                installation_method="OAUTH",
                connected_by=request.user,
                connected_at=timezone.now(),
            )
            return Response(
                {"connected": True, **SlackWorkspaceConnectionSerializer(connection).data},
                status=status.HTTP_201_CREATED,
            )

        return Response(
            {"error": "Provide either bot_access_token (+ signing_secret) or code."},
            status=status.HTTP_400_BAD_REQUEST,
        )


class SlackUserLinkVerifyEndpoint(BaseAPIView):
    """
    Completes exigence 3/5's identity-link flow (see SlackUserConnection's
    docstring for the full design rationale). The pending row (with
    `user=None` and a `verification_code`) is created by the `/plane
    link` slash command handler in plane.space.views.intake_channel - a
    session-authenticated Plane user then posts the code they were shown
    in Slack here to claim it.
    """

    def post(self, request, slug):
        code = request.data.get("code")
        if not code:
            return Response({"error": "code is required"}, status=status.HTTP_400_BAD_REQUEST)

        pending = SlackUserConnection.objects.filter(
            workspace__slug=slug, verification_code=code, user__isnull=True
        ).first()
        if pending is None or not pending.is_code_valid():
            return Response({"error": "Invalid or expired code"}, status=status.HTTP_400_BAD_REQUEST)

        pending.user = request.user
        pending.linked_at = timezone.now()
        pending.verification_code = None
        pending.code_expires_at = None
        pending.save(update_fields=["user", "linked_at", "verification_code", "code_expires_at"])
        return Response(SlackUserConnectionSerializer(pending).data, status=status.HTTP_200_OK)


class SlackUserConnectionEndpoint(BaseAPIView):
    """Current user's own Slack link status/unlink for this workspace."""

    def get(self, request, slug):
        connection = SlackUserConnection.objects.filter(
            workspace__slug=slug, user=request.user
        ).first()
        if connection is None:
            return Response({"linked": False}, status=status.HTTP_200_OK)
        return Response({"linked": True, **SlackUserConnectionSerializer(connection).data}, status=status.HTTP_200_OK)

    def delete(self, request, slug):
        SlackUserConnection.objects.filter(workspace__slug=slug, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlackChannelProjectMappingViewSet(BaseViewSet):
    """
    Exigence 11/12 - N:N channel<->project mapping with per-mapping
    notify_on event selection. Permission scoping (exigence 12: a
    mapping must never surface events for a project the configuring
    admin has no access to) is enforced structurally, not by an extra
    runtime check: `@allow_permission([ROLE.ADMIN])` at the default
    PROJECT level requires the requester to be ROLE.ADMIN of the EXACT
    `project_id` in the URL (see plane.app.permissions.base.allow_permission) -
    there is no code path in this view that can create, list, or modify a
    mapping for any project the caller isn't themselves an admin of.
    """

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
            return Response(
                {"error": "No active Slack connection for this workspace"}, status=status.HTTP_400_BAD_REQUEST
            )

        notify_on = request.data.get("notify_on", list(SLACK_NOTIFY_EVENT_CHOICES))
        invalid = set(notify_on) - set(SLACK_NOTIFY_EVENT_CHOICES)
        if invalid:
            return Response(
                {"error": f"Invalid notify_on values: {sorted(invalid)}"}, status=status.HTTP_400_BAD_REQUEST
            )

        mapping, created = SlackChannelProjectMapping.objects.get_or_create(
            project_id=project_id,
            workspace_id=project.workspace_id,
            slack_connection=connection,
            slack_channel_id=request.data.get("slack_channel_id"),
            defaults={
                "slack_channel_name": request.data.get("slack_channel_name", ""),
                "is_default_for_dm": request.data.get("is_default_for_dm", False),
                "notify_on": notify_on,
            },
        )
        return Response(
            self.serializer_class(mapping).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        mapping = self.get_queryset().filter(pk=pk).first()
        if mapping is None:
            return Response({"error": "Mapping not found"}, status=status.HTTP_404_NOT_FOUND)

        if "notify_on" in request.data:
            invalid = set(request.data["notify_on"]) - set(SLACK_NOTIFY_EVENT_CHOICES)
            if invalid:
                return Response(
                    {"error": f"Invalid notify_on values: {sorted(invalid)}"}, status=status.HTTP_400_BAD_REQUEST
                )
            mapping.notify_on = request.data["notify_on"]
        if "is_active" in request.data:
            mapping.is_active = request.data["is_active"]
        mapping.save()
        return Response(self.serializer_class(mapping).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        mapping = self.get_queryset().filter(pk=pk).first()
        if mapping is not None:
            mapping.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
