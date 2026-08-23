# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

`GET|POST /Users`, `GET|PUT|PATCH|DELETE /Users/{id}`. The `{id}` in the
URL is `WorkspaceMember.id` (never the global `User.id`) - see
`plane.scim.resources`'s own module docstring for why.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.db.models import WorkspaceMember
from plane.scim.exceptions import SCIMError
from plane.scim.filters import parse_scim_filter
from plane.scim.pagination import scim_paginate
from plane.scim.provisioning import apply_patch_operations, create_scim_user, deactivate_member, replace_scim_user
from plane.scim.resources import build_scim_user_resource
from plane.scim.views.base import SCIMBaseAPIView


class SCIMUsersView(SCIMBaseAPIView):
    """`GET|POST /api/scim/v2/Users`"""

    def _base_queryset(self):
        return WorkspaceMember.objects.filter(workspace=self.workspace).select_related("member").order_by("-created_at")

    def get(self, request):
        queryset = self._base_queryset()

        parsed_filter = parse_scim_filter(request.query_params.get("filter"))
        if parsed_filter is not None:
            _attr, value = parsed_filter
            # Both supported attributes (userName, emails.value) resolve
            # to the same underlying field in this fork's data model - see
            # plane.scim.filters's own module docstring for why only these
            # two forms are supported at all.
            queryset = queryset.filter(member__email__iexact=value)

        envelope = scim_paginate(queryset, request.query_params, build_scim_user_resource)
        return Response(envelope)

    def post(self, request):
        if not isinstance(request.data, dict):
            raise SCIMError(detail="Request body must be a JSON object.", status_code=400, scim_type="invalidSyntax")

        member = create_scim_user(self.workspace, request.data, self.scim_token, request)
        return Response(build_scim_user_resource(member), status=status.HTTP_201_CREATED)


class SCIMUserDetailView(SCIMBaseAPIView):
    """`GET|PUT|PATCH|DELETE /api/scim/v2/Users/{id}`"""

    def _get_member(self, member_id):
        member = (
            WorkspaceMember.objects.filter(workspace=self.workspace, pk=member_id).select_related("member").first()
        )
        if member is None:
            raise SCIMError(detail="User not found.", status_code=404, scim_type=None)
        return member

    def get(self, request, member_id):
        member = self._get_member(member_id)
        return Response(build_scim_user_resource(member))

    def put(self, request, member_id):
        if not isinstance(request.data, dict):
            raise SCIMError(detail="Request body must be a JSON object.", status_code=400, scim_type="invalidSyntax")
        member = self._get_member(member_id)
        member = replace_scim_user(self.workspace, member, request.data, self.scim_token, request)
        return Response(build_scim_user_resource(member))

    def patch(self, request, member_id):
        if not isinstance(request.data, dict):
            raise SCIMError(detail="Request body must be a JSON object.", status_code=400, scim_type="invalidSyntax")
        member = self._get_member(member_id)
        operations = request.data.get("Operations")
        if not isinstance(operations, list):
            raise SCIMError(detail="'Operations' must be a non-empty array.", status_code=400, scim_type="invalidValue")
        member = apply_patch_operations(self.workspace, member, operations, self.scim_token, request)
        return Response(build_scim_user_resource(member))

    def delete(self, request, member_id):
        # Exigence 7 - ALWAYS equivalent to PATCH active:false. Never a
        # physical User deletion, never touches historical
        # issues/comments/contributions. See plane.scim.provisioning.
        # deactivate_member's own docstring.
        member = self._get_member(member_id)
        deactivate_member(self.workspace, member, self.scim_token, request, verb="deprovisioned")
        return Response(status=status.HTTP_204_NO_CONTENT)
