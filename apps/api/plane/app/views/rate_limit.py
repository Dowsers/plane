# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Session-authenticated counterpart to
# plane.api.views.rate_limit.APITokenRateLimitOverrideEndpoint. That view
# inherits plane.api.views.base.BaseAPIView, whose sole authentication
# backend is APIKeyAuthentication (X-Api-Key header) - a plain
# cookie-authenticated browser request carries no such header and would
# 401 there outright, so the Workspace Settings > API Tokens "request an
# override" UI (docs/feature-specs/08-api-webhooks-cli.md "2. Rate
# limiting plus genereux" in plane-selfhost) needs this session-authenticated
# twin instead. Both share the same validation/write logic via
# `apply_rate_limit_override` (plane.api.rate_limit) so they can never
# silently diverge.

from rest_framework import status
from rest_framework.response import Response

from .base import BaseAPIView
from plane.api.rate_limit import apply_rate_limit_override, RateLimitOverrideError
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import APIToken


class WorkspaceAPITokenRateLimitOverrideEndpoint(BaseAPIView):
    """PATCH /api/workspaces/{slug}/api-tokens/{pk}/rate-limit-override/ -
    Workspace Admin only (spec exigence 8)."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        token = APIToken.objects.filter(
            pk=pk,
            user__member_workspace__workspace__slug=slug,
            user__member_workspace__is_active=True,
        ).first()
        if token is None:
            return Response(
                {"error": "The requested token does not exist in this workspace"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            apply_rate_limit_override(
                token,
                allowed_rate_limit=request.data.get("allowed_rate_limit"),
                reason=request.data.get("reason"),
                overridden_by=request.user,
            )
        except RateLimitOverrideError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "id": str(token.id),
                "allowed_rate_limit": token.allowed_rate_limit,
                "rate_limit_overridden_by": str(token.rate_limit_overridden_by_id),
                "rate_limit_overridden_at": token.rate_limit_overridden_at,
                "rate_limit_override_reason": token.rate_limit_override_reason,
            },
            status=status.HTTP_200_OK,
        )
