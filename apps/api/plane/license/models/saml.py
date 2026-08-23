# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 1 - "SSO SAML 2.0 natif".

Models live in `plane.license.models`, alongside `Instance`/
`InstanceAdmin`/`InstanceConfiguration` - the spec's own "a cote
d'InstanceConfiguration" wording, and the same app every other
instance-admin-only (god-mode) model in this fork already lives in. NOT
`plane.db.models`, which is the per-workspace/per-user domain app.

*** VERIFICATION LIMITATION - READ BEFORE TRUSTING THIS CODE ***
This feature (this file, `plane.utils.saml_xml`, `plane.utils.saml_keys`,
`plane.utils.saml_enforcement`, the ACS/login/metadata endpoints, and the
JIT-provisioning adapter) was built and verified ENTIRELY against
self-authored synthetic fixtures: a self-signed test IdP certificate/
keypair generated inside the throwaway test suite, and hand-constructed
valid / invalid-signature / expired / wrong-audience / replayed /
signature-wrapped SAMLResponse XML documents. This sandbox has NO real
IdP available (no reachable or creatable Okta/Azure AD/Google Workspace
trial tenant) and this code has NEVER been exercised in a real SP<->IdP
round-trip. Treat it as "protocol-correct against the SAML 2.0 core spec
and the specific attack classes we constructed fixtures for" - NOT as
"proven to interoperate with any specific real-world IdP". A real IdP may
emit assertions with namespace prefixes, attribute shapes, or signature
placements this implementation has never seen.
"""

from django.db import models

from plane.db.models import BaseModel


def get_default_attribute_mapping() -> dict:
    """Exigence 2 - `email` mandatory, `first_name`/`last_name` optional.
    Values are the SAML `<Attribute Name="...">` (or `FriendlyName`) an
    admin's IdP actually emits - these defaults are a reasonable starting
    point (many IdPs, including Okta/Azure AD default SAML attribute
    statements, use these exact names), not a hardcoded assumption -
    always admin-editable per configuration."""
    return {"email": "email", "first_name": "first_name", "last_name": "last_name"}


class SAMLSignatureAlgorithm(models.TextChoices):
    """Exigence 2 - algorithm this SP uses when it signs its own outbound
    AuthnRequest (see `plane.utils.saml_xml.build_authn_request_redirect_url`).
    Also the set of digest/signature algorithms this config's ACS accepts
    when verifying the IdP's inbound assertion signature (see
    `plane.utils.saml_xml.verify_and_extract_assertion`) - SHA-1 variants
    are deliberately not offered, matching `signxml`'s own default
    exclusion of SHA-1 (a long-deprecated, collision-broken digest that a
    2026-era SAML integration must never accept)."""

    RSA_SHA256 = "rsa-sha256", "RSA-SHA256"
    RSA_SHA384 = "rsa-sha384", "RSA-SHA384"
    RSA_SHA512 = "rsa-sha512", "RSA-SHA512"


class InstanceSAMLConfiguration(BaseModel):
    name = models.CharField(max_length=255)
    idp_entity_id = models.CharField(max_length=1000)
    idp_sso_url = models.URLField(max_length=1000)
    idp_slo_url = models.URLField(max_length=1000, null=True, blank=True)
    idp_certificate = models.TextField(help_text="PEM-encoded X.509 certificate the IdP signs assertions with.")
    metadata_url = models.URLField(
        max_length=1000,
        null=True,
        blank=True,
        help_text="Optional IdP metadata URL, stored for a future auto-refresh mechanism. Not auto-fetched today.",
    )
    # Generated, not admin-entered (exigence 5) - computed once at
    # creation time in the admin create view from this instance's own
    # public base URL (`plane.authentication.utils.host.base_host`,
    # is_app=True) and this row's own `id`, then never changed - this is
    # the AudienceRestriction value assertions are checked against, so it
    # must stay stable for the lifetime of the config (an IdP-side
    # integration is configured against this exact string).
    sp_entity_id = models.CharField(max_length=1000, blank=True)
    attribute_mapping = models.JSONField(default=get_default_attribute_mapping)
    signature_algorithm = models.CharField(
        max_length=32, choices=SAMLSignatureAlgorithm.choices, default=SAMLSignatureAlgorithm.RSA_SHA256
    )
    is_enabled = models.BooleanField(default=False)
    enforce_sso = models.BooleanField(default=False)
    # Exigence 8 - "tolerance d'horloge configurable, defaut 3 min". The
    # spec doesn't say whether this belongs on the config or a separate
    # instance-wide constant. Decision: per-config field, default 180s -
    # different IdPs wired to the same self-hosted instance can have
    # different real-world clock drift characteristics, and a per-config
    # field is no more complex than a global setting while being strictly
    # more flexible. See `plane.utils.saml_xml.verify_and_extract_assertion`
    # for where this is actually applied against `NotBefore`/`NotOnOrAfter`.
    clock_skew_tolerance_seconds = models.PositiveIntegerField(default=180)

    class Meta:
        verbose_name = "Instance SAML Configuration"
        verbose_name_plural = "Instance SAML Configurations"
        db_table = "instance_saml_configurations"
        ordering = ("-created_at",)

    def __str__(self):
        return self.name


class SAMLVerifiedDomain(BaseModel):
    """A domain claimed for SAML routing - unlike feature 6's
    per-workspace `WorkspaceVerifiedDomain`, this is GLOBALLY unique
    across the whole instance (`domain` has a plain DB-level
    `unique=True`, deliberately not scoped by any FK) because SAML
    routing (`/auth/saml/discover`, `enforce_sso` rejection) happens
    PRE-LOGIN, before any workspace membership is known - there is no
    workspace to scope by yet. This also means exigence 4 ("un meme
    domaine ne peut etre rattache qu'a une seule configuration SAML
    active a la fois") is structurally guaranteed by the DB constraint
    alone: a domain string can only ever have ONE `SAMLVerifiedDomain`
    row, active config or not. The admin "add domain" endpoint still
    pre-checks and returns a friendly 400
    ("this domain is already registered to a SAML configuration")
    instead of surfacing a raw `IntegrityError` - see
    `plane.license.api.views.saml.InstanceSAMLDomainEndpoint.post`.
    """

    domain = models.CharField(max_length=255, unique=True, db_index=True)
    saml_configuration = models.ForeignKey(
        InstanceSAMLConfiguration, on_delete=models.CASCADE, related_name="domains"
    )
    verification_token = models.CharField(max_length=64)
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "SAML Verified Domain"
        verbose_name_plural = "SAML Verified Domains"
        db_table = "saml_verified_domains"
        ordering = ("-created_at",)

    def __str__(self):
        return self.domain


class SAMLAssertionReplay(BaseModel):
    """Anti-replay ledger (exigence 8) - every successfully-verified
    assertion's `ID` is recorded here at the moment it's accepted; the ACS
    endpoint rejects any assertion whose `ID` already exists here BEFORE
    doing any further processing. Purged by
    `plane.bgtasks.cleanup_task.purge_expired_saml_assertion_replays`
    (daily Celery beat task, matching this module's ~9 other daily purge
    tasks) once `expires_at` (set to the assertion's own
    `NotOnOrAfter` at insert time) has passed - an assertion whose validity
    window is over can never be replayed successfully anyway (rejected by
    the `NotOnOrAfter` check first), so keeping its replay row around
    forever serves no purpose.
    """

    assertion_id = models.CharField(max_length=255, unique=True, db_index=True)
    saml_configuration = models.ForeignKey(
        InstanceSAMLConfiguration, on_delete=models.CASCADE, related_name="consumed_assertions"
    )
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        verbose_name = "SAML Assertion Replay"
        verbose_name_plural = "SAML Assertion Replays"
        db_table = "saml_assertion_replays"
        ordering = ("-created_at",)

    def __str__(self):
        return self.assertion_id
