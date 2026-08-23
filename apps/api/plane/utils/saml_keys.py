# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 1 "SSO SAML 2.0 natif" - SP signing keypair.

Judgment call / documented deviation: the spec's own
`InstanceSAMLConfiguration` field list (see `plane.license.models.saml`)
has no `sp_private_key`/`sp_certificate` field, yet exigence 6 explicitly
requires the SP-initiated flow's `SAMLRequest` to be SIGNED. Rather than
add per-config key material to the model (not asked for, and the SP's own
identity when INITIATING a request doesn't need to vary per IdP the way
the IdP's certificate does), this module lazily generates ONE self-signed
RSA keypair for the whole instance the first time it's needed, and
persists it via `InstanceConfiguration` (the same key/value store every
other instance-level secret - Google/GitHub OAuth client secrets - already
uses), private key encrypted at rest with the same Fernet-based
`encrypt_data`/`decrypt_data` those use.

This keypair is used ONLY to sign our own outbound `AuthnRequest` (HTTP
Redirect binding query-string signing, see
`plane.utils.saml_xml.build_authn_request_redirect_url`) - it plays no
role in verifying the IdP's inbound assertions (that uses the IdP's own
`idp_certificate`, per config, via `signxml`).
"""

import logging
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from django.db import IntegrityError

logger = logging.getLogger("plane.utils.saml_keys")

SP_PRIVATE_KEY_CONFIG_KEY = "SAML_SP_PRIVATE_KEY"
SP_CERTIFICATE_CONFIG_KEY = "SAML_SP_CERTIFICATE"
SP_KEY_VALIDITY_DAYS = 3650  # 10 years - self-signed, only ever used to sign our own outbound AuthnRequests.


def _generate_self_signed_keypair() -> tuple[str, str]:
    """Returns (private_key_pem, certificate_pem)."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "plane-saml-sp")])
    now = datetime.now(dt_timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=SP_KEY_VALIDITY_DAYS))
        .sign(private_key, hashes.SHA256())
    )
    private_key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    return private_key_pem, cert_pem


def get_or_create_sp_signing_key() -> tuple[str, str]:
    """Returns (private_key_pem, certificate_pem). Reads/writes
    `InstanceConfiguration` DIRECTLY - deliberately bypassing
    `plane.license.utils.instance_value.get_configuration_value`'s
    env-var-or-DB-row branching, since this is a generated secret with no
    admin-facing environment-variable equivalent to ever fall back to."""
    from plane.license.models import InstanceConfiguration
    from plane.license.utils.encryption import decrypt_data, encrypt_data

    private_row = InstanceConfiguration.objects.filter(key=SP_PRIVATE_KEY_CONFIG_KEY).first()
    cert_row = InstanceConfiguration.objects.filter(key=SP_CERTIFICATE_CONFIG_KEY).first()
    if private_row and cert_row and private_row.value and cert_row.value:
        return decrypt_data(private_row.value), cert_row.value

    private_key_pem, cert_pem = _generate_self_signed_keypair()
    try:
        InstanceConfiguration.objects.create(
            key=SP_PRIVATE_KEY_CONFIG_KEY,
            value=encrypt_data(private_key_pem),
            category="SAML",
            is_encrypted=True,
        )
        InstanceConfiguration.objects.create(
            key=SP_CERTIFICATE_CONFIG_KEY,
            value=cert_pem,
            category="SAML",
            is_encrypted=False,
        )
        logger.info("Generated a new instance-wide SAML SP signing keypair.")
    except IntegrityError:
        # Lost a create race with a concurrent caller - converge on
        # whichever keypair actually made it into the DB rather than the
        # one we just generated, so every caller ends up signing with the
        # SAME key.
        private_row = InstanceConfiguration.objects.filter(key=SP_PRIVATE_KEY_CONFIG_KEY).first()
        cert_row = InstanceConfiguration.objects.filter(key=SP_CERTIFICATE_CONFIG_KEY).first()
        if private_row and cert_row and private_row.value and cert_row.value:
            return decrypt_data(private_row.value), cert_row.value
        raise
    return private_key_pem, cert_pem
