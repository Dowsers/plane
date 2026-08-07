# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# See docs/feature-specs/08-api-webhooks-cli.md ("2. Rate limiting plus
# genereux") in plane-selfhost for the full feature spec these implement.

# Python imports
import time

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.db.models import APIToken, Workspace
from plane.api.rate_limit import (
    TieredSlidingWindowRateThrottle,
    MINUTE_WINDOW_SECONDS,
    HOUR_WINDOW_SECONDS,
    apply_rate_limit_override,
    RateLimitOverrideError,
)
from plane.settings.redis import redis_instance
from plane.app.permissions import WorkspaceOwnerPermission


class RateLimitStatusEndpoint(BaseAPIView):
    """
    GET /api/v1/workspaces/{slug}/rate-limit-status/

    Returns the resolved tier, current consumption and reset time for the
    token that authenticated the current request (exigence: "un
    developpeur ... veut voir dans les en-tetes HTTP ma consommation
    actuelle" - this is the equivalent as a queryable JSON endpoint rather
    than headers alone, per the spec's own "Endpoints REST nouveaux" list).

    Note this is NOT actually scoped by workspace data-wise - `APIToken`
    is not workspace-scoped in this codebase (confirmed: the one migration
    that ever touched `APIToken.workspace`, `0115_auto_20260105_1406.py`,
    deliberately clears it for personal tokens) - a token's rate limit is
    per-token, full stop. The `{slug}` path segment exists to match this
    fork's own `/api/v1/workspaces/<str:slug>/...` URL convention (see any
    other `plane.api.urls` module) and is validated to exist, but does not
    otherwise change the response.
    """

    def get(self, request, slug):
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        api_key = request.headers.get("X-Api-Key")
        if not api_key:
            return Response(
                {"error": "This endpoint requires X-Api-Key authentication"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = APIToken.objects.filter(token=api_key).select_related("rate_limit_tier").first()
        if token is None:
            return Response({"error": "Token not found"}, status=status.HTTP_404_NOT_FOUND)

        throttle = TieredSlidingWindowRateThrottle()
        minute_limit, hour_limit, tier_key = throttle.resolve_effective_limit(token)

        now = time.time()
        used_per_minute = 0
        used_per_hour = 0
        try:
            ri = redis_instance()
            minute_key = f"rate_limit:{tier_key}:{token.id}:minute"
            hour_key = f"rate_limit:{tier_key}:{token.id}:hour"
            ri.zremrangebyscore(minute_key, "-inf", now - MINUTE_WINDOW_SECONDS)
            ri.zremrangebyscore(hour_key, "-inf", now - HOUR_WINDOW_SECONDS)
            used_per_minute = int(ri.zcard(minute_key))
            used_per_hour = int(ri.zcard(hour_key))
        except Exception:
            # Fail open on read too - a Redis hiccup should report "0
            # used" rather than break this status endpoint.
            pass

        return Response(
            {
                "tier": tier_key,
                "requests_per_minute": minute_limit,
                "requests_per_hour": hour_limit,
                "used_per_minute": used_per_minute,
                "used_per_hour": used_per_hour,
                "remaining_per_minute": max(0, minute_limit - used_per_minute),
                "remaining_per_hour": max(0, hour_limit - used_per_hour),
                "reset_at_minute": int(now + MINUTE_WINDOW_SECONDS),
                "reset_at_hour": int(now + HOUR_WINDOW_SECONDS),
                "overridden": token.rate_limit_overridden_at is not None,
            },
            status=status.HTTP_200_OK,
        )


class APITokenRateLimitOverrideEndpoint(BaseAPIView):
    """
    PATCH /api/v1/workspaces/{slug}/api-tokens/{pk}/rate-limit-override/

    Workspace Admin only (spec exigence 8) - sets a per-token override
    that takes priority over the token's resolved tier, with mandatory
    `reason` for traceability (who/when/why).

    Scoping note: since `APIToken` has no live workspace linkage (see
    `RateLimitStatusEndpoint` docstring above), "a token this workspace
    admin can override" is defined here as "a token owned by a member of
    this workspace" - the closest real proxy this codebase's data model
    actually supports for "a token that belongs to my workspace".

    Uses `WorkspaceOwnerPermission` (role == Admin, 20) rather than the
    confusingly-named `WorkSpaceAdminPermission` (which actually allows
    role in [Admin, Member]) - this is an admin-only, security-sensitive
    action per the spec's own wording ("administrateur de workspace"),
    not a general member action.
    """

    permission_classes = [WorkspaceOwnerPermission]

    def patch(self, request, slug, pk):
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
