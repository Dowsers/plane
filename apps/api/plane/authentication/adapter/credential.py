# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.authentication.adapter.base import Adapter
from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES, AuthenticationException


class CredentialAdapter(Adapter):
    """Common interface for all credential providers (email/password,
    magic link/OTP - NOT OAuth, see `plane.authentication.adapter.oauth`)."""

    def __init__(self, request, provider, callback=None):
        super().__init__(request=request, provider=provider, callback=callback)
        self.request = request
        self.provider = provider

    def authenticate(self):
        self.set_user_data()
        self._enforce_sso_policy()
        return self.complete_login_or_signup()

    def _enforce_sso_policy(self):
        """Category 11 (docs/feature-specs/11-admin-security-sso.md in
        plane-selfhost), feature 6, exigence 3 - shared choke point for
        BOTH credential providers (`EmailProvider`, `MagicCodeProvider`
        both subclass `CredentialAdapter`), called after the password/OTP
        has already been verified successfully (`set_user_data()` raises
        before reaching here on a bad credential) but BEFORE
        `complete_login_or_signup()` would create/return the user and let
        the caller issue a session - matches the spec's own "avant
        emission du token" wording. Deliberately NOT in the shared
        `Adapter.complete_login_or_signup()` (used by OAuth too) - SSO
        enforcement must never block the very OAuth methods it exists to
        redirect users toward.
        """
        if not self.user_data:
            return

        email = self.user_data.get("email")
        if not email:
            return

        from plane.utils.security_policy import get_sso_enforcement_for_email

        enforcement = get_sso_enforcement_for_email(email)
        if enforcement:
            self.logger.warning(f"Credential login blocked by SSO enforcement policy: {email}")
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["SSO_ENFORCED_FOR_DOMAIN"],
                error_message="SSO_ENFORCED_FOR_DOMAIN",
                payload={
                    "email": email,
                    "allowed_methods": enforcement["allowed_methods"],
                },
            )
