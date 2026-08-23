# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

Mounted at `/api/scim/v2/` (`plane.urls`, the project root URLConf) -
notice there is NO workspace slug anywhere in this path. Exigence 2's own
reasoning: Okta/Azure AD SCIM app wizards only accept a flat Base URL + a
single Bearer token, never a per-workspace URL segment - the workspace is
resolved entirely from the token itself
(`plane.scim.authentication.SCIMTokenAuthentication`).
"""

from django.urls import path

from plane.scim.views import (
    ResourceTypesEndpoint,
    SCIMUserDetailView,
    SCIMUsersView,
    SchemasEndpoint,
    ServiceProviderConfigEndpoint,
)

urlpatterns = [
    path("ServiceProviderConfig", ServiceProviderConfigEndpoint.as_view(), name="scim-service-provider-config"),
    path("ResourceTypes", ResourceTypesEndpoint.as_view(), name="scim-resource-types"),
    path("Schemas", SchemasEndpoint.as_view(), name="scim-schemas"),
    path("Users", SCIMUsersView.as_view(), name="scim-users"),
    path("Users/<uuid:member_id>", SCIMUserDetailView.as_view(), name="scim-user-detail"),
    # Trailing-slash variants - some SCIM clients (and this fork's own
    # APPEND_SLASH-friendly conventions elsewhere) send either shape; Okta/
    # Azure AD both default to NO trailing slash on these RFC 7644 paths,
    # so that's the canonical form above, with these as a compatibility
    # fallback rather than the other way around.
    path("Users/", SCIMUsersView.as_view(), name="scim-users-slash"),
    path("Users/<uuid:member_id>/", SCIMUserDetailView.as_view(), name="scim-user-detail-slash"),
]
