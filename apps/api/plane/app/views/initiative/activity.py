# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import InitiativeActivitySerializer
from plane.db.models import InitiativeActivity
from ..base import BaseAPIView


class InitiativeActivityEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, initiative_id):
        activities = (
            InitiativeActivity.objects.filter(workspace__slug=slug, initiative_id=initiative_id)
            .select_related("actor")
            .order_by("-created_at")
        )
        return Response(InitiativeActivitySerializer(activities, many=True).data, status=status.HTTP_200_OK)
