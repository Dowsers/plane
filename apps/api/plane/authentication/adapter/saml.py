# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 1 "SSO SAML 2.0 natif" - JIT provisioning
(exigence 9/10).

`SAMLAdapter` is NOT a `CredentialAdapter`/`OauthAdapter` subclass - a
verified SAML assertion (see `plane.utils.saml_xml.SAMLAssertionResult`)
doesn't fit either shape (no password/OTP to check, no token-exchange HTTP
round-trip to perform - `plane.authentication.views.saml`'s ACS endpoint
already did all of that via `plane.utils.saml_xml.
verify_and_extract_assertion` before this adapter is ever constructed).
It subclasses `Adapter` directly and reuses the SAME shared
`complete_login_or_signup()` choke point every other provider in this
codebase uses - JIT user creation, `is_bot` rejection, invite-processing
`callback`, `is_password_autoset` handling - rather than re-implementing
that logic a third time.
"""

from django.db import DatabaseError, IntegrityError
from django.utils import timezone

from plane.db.models import Account
from plane.utils.exception_logger import log_exception

from .base import Adapter


class SAMLAdapter(Adapter):
    provider = "saml"

    def __init__(self, request, config, assertion_result, callback=None):
        super().__init__(request=request, provider=self.provider, callback=callback)
        self.config = config
        self.assertion_result = assertion_result

    def authenticate(self):
        self.set_user_data()
        # `complete_login_or_signup()` only calls `create_update_account()`
        # when `self.token_data` is truthy (see `Adapter.
        # complete_login_or_signup`'s own `if self.token_data:` check) -
        # SAML has no OAuth-style token, but the assertion's own identity
        # is the closest real equivalent, so it's stored here for exactly
        # that purpose.
        self.set_token_data(
            {"name_id": self.assertion_result.name_id, "assertion_id": self.assertion_result.assertion_id}
        )
        return self.complete_login_or_signup()

    def set_user_data(self, data=None):
        attributes = self.assertion_result.attributes
        self.user_data = {
            "email": attributes.get("email"),
            "user": {
                "first_name": attributes.get("first_name", ""),
                "last_name": attributes.get("last_name", ""),
                "avatar": "",
                "provider_id": self.assertion_result.name_id,
                # Exigence 9 - JIT-provisioned accounts get no usable
                # password, matching every other passwordless provider
                # (magic-link, OAuth) already using this same flag.
                "is_password_autoset": True,
            },
        }

    def create_update_account(self, user):
        """Exigence 9/10 - links (never duplicates) a `User` to this SAML
        identity via `Account` (`provider="saml"`, `provider_account_id`
        = the assertion's `NameID`, `metadata` = latest attributes, per
        decision #3). Whether `user` was just JIT-created or was an
        existing password/OAuth account reused by email (both handled
        upstream in `Adapter.complete_login_or_signup`), this method's job
        is only to create-or-refresh the SAML `Account` link itself."""
        try:
            account = Account.objects.filter(
                user=user, provider=self.provider, provider_account_id=self.assertion_result.name_id
            ).first()
            if account:
                account.last_connected_at = timezone.now()
                account.metadata = self.assertion_result.attributes
                account.save()
            else:
                Account.objects.create(
                    user=user,
                    provider=self.provider,
                    provider_account_id=self.assertion_result.name_id,
                    access_token="",
                    last_connected_at=timezone.now(),
                    metadata=self.assertion_result.attributes,
                )
        except (DatabaseError, IntegrityError) as e:
            log_exception(e)
