# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Read-only per-issue SLA status widget - see
docs/feature-specs/06-automation-workflow-sla.md ("Politiques de SLA",
section 2) in plane-selfhost, exigence 1 / exigence 6 ("un membre sans
droit d'administration ... peut consulter les SLA appliques a ses
issues"). Unlike app/views/sla/base.py (Admin-only, gates the config
screen), this is open to any active project member.
"""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueSLASerializer
from plane.db.models import IssueSLA

from ..base import BaseAPIView


class IssueSLAEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, issue_id):
        sla_entries = (
            IssueSLA.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id)
            .select_related("sla_policy")
            .order_by("sla_type")
        )
        return Response(IssueSLASerializer(sla_entries, many=True).data, status=status.HTTP_200_OK)
