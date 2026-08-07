# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Session-authenticated counterpart to plane.api.views.flexible_query - that
# module's FlexibleQueryEndpoint/FlexibleQuerySchemaEndpoint are on the
# token-authenticated `plane.api` surface (external integrators/MCP, see
# docs/feature-specs/08-api-webhooks-cli.md "1. Couche de requetes flexible
# facon GraphQL" in plane-selfhost), but the *settings* toggle/quota display
# this endpoint backs is a web-UI workspace-settings page - it needs session
# auth (BaseAPIView here, not plane.api.views.base.BaseAPIView, whose
# APIKeyAuthentication would reject the browser's cookie-authenticated
# fetch entirely).

from rest_framework import status
from rest_framework.response import Response

from .base import BaseAPIView
from plane.app.permissions import WorkspaceEntityPermission, allow_permission, ROLE
from plane.app.serializers import WorkspaceQuerySettingsSerializer
from plane.db.models import Workspace, WorkspaceQuerySettings


class WorkspaceQuerySettingsEndpoint(BaseAPIView):
    """GET/PATCH /api/workspaces/{slug}/query-settings/ - the
    `is_flexible_query_enabled` toggle itself lives directly on `Workspace`
    (matching this codebase's flat-boolean convention for per-workspace
    feature flags, see the field's own comment in db/models/workspace.py)
    and is set through the existing generic WorkSpaceViewSet PATCH, not
    here - this endpoint only covers the three numeric quota knobs that
    have no such existing precedent to reuse.
    """

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        settings_row, _ = WorkspaceQuerySettings.objects.get_or_create(workspace=workspace)
        serializer = WorkspaceQuerySettingsSerializer(settings_row)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        settings_row, _ = WorkspaceQuerySettings.objects.get_or_create(workspace=workspace)
        serializer = WorkspaceQuerySettingsSerializer(settings_row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
