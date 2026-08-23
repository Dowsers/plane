# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

`SCIMTokenAuthentication` follows the same SHAPE as this fork's existing
`plane.api.middleware.api_authentication.APIKeyAuthentication` (a
`BaseAuthentication` subclass reading a header, returning `(user, token_obj)`,
bumping a last-used timestamp) - per this feature's own pre-implementation
research, that is the one existing pattern worth imitating here. It is a
genuinely SEPARATE class, not a subclass or a parameterized variant of it:
the header (`Authorization: Bearer <token>` vs. `X-Api-Key`), the token
model (`SCIMToken`, hashed-at-rest, vs. `APIToken`, plaintext), and the
workspace-resolution requirement (exigence 2 - the workspace comes FROM the
token, `APIToken.workspace` is nullable/optional for personal tokens) are
all different enough that force-fitting this into `APIKeyAuthentication`
would obscure more than it would share.
"""

from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from rest_framework import authentication, exceptions

from plane.db.models import SCIMToken
from plane.license.utils.instance_value import get_configuration_value
from plane.utils.scim_token import hash_scim_token


def is_scim_enabled() -> bool:
    """Exigence 3 - instance-wide `ENABLE_SCIM` god-mode flag. Re-checked
    LIVE on every SCIM request (not just at token-creation time) so
    flipping the instance flag off immediately blocks every already-issued
    token too, the same "no caching, live DB read" convention this
    category's own SAML enforcement (`plane.utils.saml_enforcement`) and
    security-policy enforcement already established - a disabled instance
    flag should have the same immediate effect as a disabled/deleted
    token, not linger until tokens are manually revoked one by one."""
    (value,) = get_configuration_value([{"key": "ENABLE_SCIM", "default": "0"}])
    return value == "1"


class SCIMTokenAuthentication(authentication.BaseAuthentication):
    """
    Authenticates `/api/scim/v2/*` requests via `Authorization: Bearer
    <token>`. Resolves the workspace FROM the token
    (`request.auth.workspace`) - there is deliberately no workspace slug
    anywhere in the SCIM URL space (`plane.scim.urls`), matching exigence
    2's own reasoning: Okta/Azure AD connection wizards only accept a flat
    Base URL + Bearer token, never a per-workspace URL segment.

    `request.user` is set to the token's `created_by` (the workspace
    Admin/Owner who generated it) - there is no natural "system" User row
    in this codebase to use instead, and attributing SCIM-driven writes to
    the human accountable for the token (for `BaseModel.save()`'s own
    crum-based `created_by` stamping, and as a fallback audit-log actor)
    is more meaningful than leaving it anonymous. If that user was since
    deleted (`SET_NULL`), `request.user` falls back to a plain
    `AnonymousUser()` (NOT `None`) - several shared utilities this
    package's own views call into (`plane.utils.cache.
    invalidate_cache_directly`, `BaseModel.save()`'s crum stamping) assume
    `request.user` is at least an `AnonymousUser`-shaped object with a
    real `.is_anonymous`; `SCIMBaseAPIView`'s own `HasSCIMToken`
    permission gates on `request.auth` (the token), never on
    `request.user`, so this fallback never affects whether the request is
    treated as authenticated.
    """

    www_authenticate_realm = "scim"
    media_type = "application/scim+json"
    auth_header_prefix = "Bearer"

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != self.auth_header_prefix.lower():
            raise exceptions.AuthenticationFailed("Authorization header must be 'Bearer <token>'.")

        raw_token = parts[1]

        # Exigence 3 - checked BEFORE the token lookup itself, live, no
        # caching (see `is_scim_enabled` docstring) - a technically-valid
        # token must still be rejected outright while SCIM is disabled
        # instance-wide.
        if not is_scim_enabled():
            raise exceptions.PermissionDenied("SCIM provisioning is not enabled on this instance.")

        token_hash = hash_scim_token(raw_token)
        scim_token = SCIMToken.objects.select_related("workspace", "created_by").filter(token_hash=token_hash).first()
        if scim_token is None or not scim_token.is_active:
            raise exceptions.AuthenticationFailed("Invalid or revoked SCIM token.")

        if scim_token.workspace is None or scim_token.workspace.deleted_at is not None:
            # Defense in depth - a token whose workspace was hard-deleted
            # (CASCADE would normally remove the token row itself, but a
            # soft-deleted workspace leaves the FK intact) must never
            # resolve to a live workspace.
            raise exceptions.AuthenticationFailed("Invalid or revoked SCIM token.")

        SCIMToken.objects.filter(pk=scim_token.pk).update(last_used_at=timezone.now())

        return (scim_token.created_by or AnonymousUser(), scim_token)

    def authenticate_header(self, request):
        # Drives the `WWW-Authenticate` header on a 401 - standard DRF
        # BaseAuthentication contract.
        return f'{self.auth_header_prefix} realm="{self.www_authenticate_realm}"'
