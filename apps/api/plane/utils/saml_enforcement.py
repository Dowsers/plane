# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 1 "SSO SAML 2.0 natif" - email/domain -> SAML
config resolution, used by BOTH `/auth/saml/discover` (routing: which IdP,
if any, should the login screen point this email at) and the `enforce_sso`
login-rejection checks (exigence 11) wired into
`plane.authentication.adapter.base.Adapter.complete_login_or_signup`.

Distinct from feature 6's `plane.utils.security_policy.
get_sso_enforcement_for_email` (per-WORKSPACE `enforce_sso_only`, which
never blocks OAuth - OAuth is what it redirects users toward) - this is
INSTANCE-level SAML domain routing, blocks email/OTP, password, AND OAuth
alike (exigence 11's own wording), and the two checks are independent and
run alongside each other, never merged - see that module's own docstring
and `Adapter.complete_login_or_signup`'s call site for how they compose.

Exigence 16 (immediate fallback on disable) is satisfied by construction:
every function here does a live, uncached DB query on every call - there
is no caching layer to invalidate, so disabling a config or un-verifying
its domain takes effect on the very next login attempt.
"""

from typing import Optional


def resolve_saml_config_for_email(email: str):
    """domain -> the ONE verified + enabled `InstanceSAMLConfiguration`
    routing this email, or `None`. `SAMLVerifiedDomain.domain` is globally
    unique (see that model's own docstring), so at most one row can ever
    match - no ambiguity to resolve, unlike feature 6's per-workspace
    domain lookup."""
    from plane.license.models import SAMLVerifiedDomain

    domain = (email or "").rsplit("@", 1)[-1].strip().lower()
    if not domain:
        return None

    verified_domain = (
        SAMLVerifiedDomain.objects.filter(domain=domain, is_verified=True, saml_configuration__is_enabled=True)
        .select_related("saml_configuration")
        .first()
    )
    return verified_domain.saml_configuration if verified_domain else None


def get_saml_enforcement_for_email(email: str) -> Optional[object]:
    """Returns the `InstanceSAMLConfiguration` if it both routes this
    email's domain AND has `enforce_sso=True` (i.e. every other login
    method must be rejected for this email - exigence 11), or `None`
    (either no SAML routing at all, or SAML is available but not
    mandatory for this domain)."""
    config = resolve_saml_config_for_email(email)
    if config is not None and config.enforce_sso:
        return config
    return None
