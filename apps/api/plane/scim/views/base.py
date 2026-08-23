# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

`SCIMBaseAPIView` - plain DRF `APIView`, deliberately NOT a subclass of
`plane.app.views.base.BaseAPIView`/`BaseViewSet` (this feature's own
pre-implementation research concluded SCIM is closer to a second,
protocol-specific micro-framework than another view on this fork's
existing conventions - opaque-cursor pagination, exact-match filtering,
partial-serializer PATCH, and the `{"error": ...}` envelope are all
incompatible with what SCIM 2.0 actually requires). This base class is the
one, minimal, shared choke point every concrete SCIM view goes through:
Bearer-token auth, the SCIM-shaped error envelope, and the SCIM-specific
rate-limit tier.
"""

from rest_framework.permissions import BasePermission
from rest_framework.views import APIView

from plane.scim.authentication import SCIMTokenAuthentication
from plane.scim.exceptions import scim_exception_handler
from plane.scim.throttling import SCIMTieredRateThrottle


class HasSCIMToken(BasePermission):
    """Gates on whether `SCIMTokenAuthentication` actually resolved a
    `SCIMToken` (`request.auth`) - deliberately NOT `IsAuthenticated`
    (which gates on `request.user.is_authenticated`): `request.user` is set
    to the token's `created_by`, which is legitimately `None` when that
    Admin/Owner account was since deleted (`SET_NULL`) - the token itself
    can still be perfectly valid and must keep working, so authentication
    success is judged by the presence of the token object, not the user."""

    def has_permission(self, request, view):
        return getattr(request, "auth", None) is not None


class SCIMBaseAPIView(APIView):
    authentication_classes = [SCIMTokenAuthentication]
    permission_classes = [HasSCIMToken]
    throttle_classes = [SCIMTieredRateThrottle]

    def get_exception_handler(self):
        return scim_exception_handler

    @property
    def scim_token(self):
        """The authenticated `SCIMToken` for this request - DRF sets
        `request.auth` to the second element `SCIMTokenAuthentication.
        authenticate()` returned."""
        return self.request.auth

    @property
    def workspace(self):
        return self.scim_token.workspace
