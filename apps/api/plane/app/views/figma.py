# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Session-authenticated (plane.app) workspace-level Figma OAuth connection -
see docs/feature-specs/07-integrations-git.md ("4. Plugin Figma") in
plane-selfhost, docker/api/figma-integration/README.md.

Genuinely greenfield before this session - no Figma model/view/migration/
frontend component existed anywhere in this fork.
"""

from urllib.parse import urlencode

from django.conf import settings
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response

from .base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import FigmaWorkspaceConnectionSerializer
from plane.db.models import FigmaFileLink, FigmaWorkspaceConnection, Workspace
from plane.utils.exception_logger import log_exception
from plane.utils.figma_client import FigmaAPIError, exchange_code_for_token, get_me

FIGMA_OAUTH_AUTHORIZE_URL = "https://www.figma.com/oauth"
FIGMA_OAUTH_SCOPE = "file_read"


class FigmaWorkspaceConnectionEndpoint(BaseAPIView):
    """Status/disconnect for the workspace's Figma connection."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        connection = FigmaWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is None:
            return Response({"connected": False}, status=status.HTTP_200_OK)
        return Response(
            {"connected": True, **FigmaWorkspaceConnectionSerializer(connection).data}, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug):
        """
        Exigence 2 - disconnecting deactivates the connection AND flips
        `sync_status_enabled=False` on every FigmaFileLink in the
        workspace (status sync stops), but keeps every link row itself
        (no cascade delete) - the UI is expected to show a "Figma
        integration disconnected" banner on the now-degraded links
        rather than have them silently vanish.
        """
        connection = FigmaWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).first()
        if connection is not None:
            connection.is_active = False
            connection.save(update_fields=["is_active"])
            FigmaFileLink.objects.filter(workspace_id=connection.workspace_id, sync_status_enabled=True).update(
                sync_status_enabled=False
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class FigmaOAuthAuthorizeEndpoint(BaseAPIView):
    """
    Builds the real Figma OAuth2 authorize URL
    (https://www.figma.com/developers/api#oauth2). Returns 501 when
    FIGMA_CLIENT_ID isn't configured - this sandbox has no registered
    Figma app and no publicly-reachable callback URL, so this path is
    real code but untestable end-to-end here. See
    docker/api/figma-integration/README.md.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        if not (settings.FIGMA_CLIENT_ID and settings.FIGMA_REDIRECT_URI):
            return Response(
                {
                    "error": (
                        "Figma OAuth is not configured on this instance - it requires a real Figma app "
                        "(client_id/secret) registered for this instance's own domain. Set FIGMA_CLIENT_ID/"
                        "FIGMA_CLIENT_SECRET/FIGMA_REDIRECT_URI. See docker/api/figma-integration/README.md."
                    )
                },
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )
        params = {
            "client_id": settings.FIGMA_CLIENT_ID,
            "redirect_uri": settings.FIGMA_REDIRECT_URI,
            "scope": FIGMA_OAUTH_SCOPE,
            "state": slug,
            "response_type": "code",
        }
        return Response(
            {"authorize_url": f"{FIGMA_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"}, status=status.HTTP_200_OK
        )


class FigmaOAuthCallbackEndpoint(BaseAPIView):
    """
    Real authorization-code exchange - same "real code, untestable
    end-to-end without a registered app + a code only Figma's own
    redirect can produce" situation as the authorize endpoint above and
    as Slack's OAuth path (SlackWorkspaceConnectEndpoint).
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        if not (settings.FIGMA_CLIENT_ID and settings.FIGMA_CLIENT_SECRET):
            return Response(
                {"error": "Figma OAuth is not configured on this instance."},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        code = request.data.get("code")
        if not code:
            return Response({"error": "code is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token_data = exchange_code_for_token(
                settings.FIGMA_CLIENT_ID, settings.FIGMA_CLIENT_SECRET, code, settings.FIGMA_REDIRECT_URI
            )
            identity = get_me(token_data["access_token"])
        except FigmaAPIError as e:
            return Response({"error": f"Figma OAuth exchange failed: {e.err}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            log_exception(e)
            return Response(
                {"error": "Could not reach Figma to complete the connection. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Exigence 1 - a second connection attempt replaces the existing
        # one (deactivated, not deleted, so history/audit survives).
        FigmaWorkspaceConnection.objects.filter(workspace__slug=slug, is_active=True).update(is_active=False)

        workspace = Workspace.objects.get(slug=slug)
        expires_in = token_data.get("expires_in")
        connection = FigmaWorkspaceConnection.objects.create(
            workspace_id=workspace.id,
            figma_user_id=str(identity.get("id", "")),
            figma_user_handle=identity.get("handle", ""),
            access_token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token", ""),
            token_expires_at=(timezone.now() + timezone.timedelta(seconds=expires_in)) if expires_in else None,
            connected_by=request.user,
        )
        return Response(
            {"connected": True, **FigmaWorkspaceConnectionSerializer(connection).data}, status=status.HTTP_201_CREATED
        )
