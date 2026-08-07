# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Instance Admin (God Mode) endpoints for editing the default rate-limit
# tiers - spec exigence 7 ("Un administrateur d'instance (God Mode) doit
# pouvoir modifier les valeurs par defaut des paliers globalement"). See
# docs/feature-specs/08-api-webhooks-cli.md in plane-selfhost.
#
# Mounted under `/api/instances/rate-limit-tiers/` (via plane.license.urls)
# rather than the spec's literally-written `/api/v1/instances/...` -
# `/api/v1/` is this fork's token-authenticated public REST API surface
# (`plane.api`), which has no concept of Instance Admin at all; every
# other God Mode endpoint in this codebase (email config, instance
# config, instance admins, ...) lives under `/api/instances/` via
# `plane.license`, session-authenticated with `InstanceAdminPermission`.
# This follows that existing convention instead of the literal spec path.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.db.models import RateLimitTier
from plane.license.api.serializers import RateLimitTierSerializer


class RateLimitTierEndpoint(BaseAPIView):
    """
    GET  /api/instances/rate-limit-tiers/       - list the 3 tiers
    PATCH /api/instances/rate-limit-tiers/<pk>/  - edit one tier's defaults

    `permission_classes = [InstanceAdminPermission]` is inherited from
    `BaseAPIView` (this app's own, in `plane/license/api/views/base.py`) -
    every endpoint in this module is Instance Admin only, per spec.
    """

    def get(self, request, pk=None):
        if pk is None:
            tiers = RateLimitTier.objects.all()
            serializer = RateLimitTierSerializer(tiers, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        tier = RateLimitTier.objects.get(pk=pk)
        serializer = RateLimitTierSerializer(tier)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        tier = RateLimitTier.objects.get(pk=pk)
        serializer = RateLimitTierSerializer(tier, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
