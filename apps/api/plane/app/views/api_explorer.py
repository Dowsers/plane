# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Session-authenticated settings panel for the interactive API explorer -
# see docs/feature-specs/08-api-webhooks-cli.md ("6. Explorateur d'API
# interactif") in plane-selfhost. The explorer's own schema/ephemeral-token
# endpoints (plane.api.views.api_explorer) are token-authenticated (the
# explorer executes real calls from the browser using a real APIToken, per
# the spec's own "hors perimetre"), but the on/off + allow-members-execute
# toggle is a Settings-UI concern set through the browser's session, same
# split as plane.app.views.flexible_query / plane.api.views.flexible_query.

from rest_framework import status
from rest_framework.response import Response

from .base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import WorkspaceAPIExplorerSettingsSerializer
from plane.db.models import Workspace, WorkspaceAPIExplorerSettings


class WorkspaceAPIExplorerSettingsEndpoint(BaseAPIView):
    """GET/PATCH /api/workspaces/{slug}/api-explorer-settings/

    Visibility rule (spec exigence 14): GET is Admin/Member only - Guests
    never see the explorer, so they should not even be able to read
    whether it is enabled. `allow_permission` 403s a Guest here exactly
    like it already does for other workspace-scoped endpoints in this
    codebase (see WebhookEndpoint etc.) - PATCH is further restricted to
    Admin only, matching WorkspaceQuerySettingsEndpoint's own precedent.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        settings_row, _ = WorkspaceAPIExplorerSettings.objects.get_or_create(workspace=workspace)
        serializer = WorkspaceAPIExplorerSettingsSerializer(settings_row)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        settings_row, _ = WorkspaceAPIExplorerSettings.objects.get_or_create(workspace=workspace)
        serializer = WorkspaceAPIExplorerSettingsSerializer(settings_row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
