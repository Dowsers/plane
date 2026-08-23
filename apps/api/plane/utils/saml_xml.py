# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 1 "SSO SAML 2.0 natif" - SAML 2.0 protocol logic
built on top of `signxml` (generic XML-DSig signature verification only -
`signxml` has no concept of SAML itself, so every SAML-specific piece
below - AuthnRequest generation/signing, HTTP-Redirect binding encoding,
SAMLResponse/Assertion parsing, `NotBefore`/`NotOnOrAfter`/audience/replay
validation, attribute extraction - is this module's own responsibility).

*** VERIFICATION LIMITATION ***
Built and tested ENTIRELY against self-authored synthetic fixtures (a
self-signed test IdP keypair, hand-constructed valid/invalid/expired/
wrong-audience/replayed/signature-wrapped SAMLResponse XML). No real IdP
(Okta/Azure AD/...) was available in this sandbox and no real SP<->IdP
round-trip has ever been performed. See `plane.license.models.saml`'s own
module docstring for the full statement - it applies to this file too.

*** "SEE WHAT IS SIGNED" - XML SIGNATURE WRAPPING DEFENSE ***
`verify_and_extract_assertion` below is the ONLY place in this codebase
that is allowed to decide what an inbound SAMLResponse "means". Every
attribute/NameID/condition extraction function in this module takes an
lxml `_Element` that is EXCLUSIVELY the `signed_xml` value `signxml`
itself returned from a successful `XMLVerifier().verify(...)` call - never
a node independently re-located in the original document by tag name
after the fact. This is the textbook defense against XML Signature
Wrapping (an attacker embeds a validly-signed Assertion somewhere in the
document while presenting a *different*, unsigned or attacker-modified
Assertion for the application to actually act on) - see the classnotes in
`_verify_signed_element`'s own docstring. Do not "simplify" this by
grabbing `response_root.find(".//Assertion")` anywhere in this file.
"""

import base64
import logging
import uuid
import zlib
from dataclasses import dataclass
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from typing import Optional
from urllib.parse import quote_plus

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from dateutil import parser as dateutil_parser
from django.db import IntegrityError
from lxml import etree
from signxml import SignatureConfiguration, XMLVerifier
from signxml.exceptions import InvalidInput, InvalidSignature

from plane.utils.saml_keys import get_or_create_sp_signing_key

logger = logging.getLogger("plane.utils.saml_xml")

SAML_PROTOCOL_NS = "urn:oasis:names:tc:SAML:2.0:protocol"
SAML_ASSERTION_NS = "urn:oasis:names:tc:SAML:2.0:assertion"

SIGNATURE_ALGORITHM_URIS = {
    "rsa-sha256": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    "rsa-sha384": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha384",
    "rsa-sha512": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512",
}
SIGNATURE_HASH_ALGORITHMS = {
    "rsa-sha256": hashes.SHA256,
    "rsa-sha384": hashes.SHA384,
    "rsa-sha512": hashes.SHA512,
}


class SAMLValidationError(Exception):
    """Raised for ANY assertion validation failure. `code` is a short
    machine-readable reason (surfaced to the instance admin ONLY, via the
    test-connection endpoint - exigence 13); `detail` is a longer string
    for server-side logs. The real, end-user-facing ACS endpoint
    (exigence 15) must NEVER surface either of these to the browser - it
    catches this exception class and returns one fixed generic message
    regardless of `code`, logging the real reason server-side via
    `logging`.
    """

    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


@dataclass
class SAMLAssertionResult:
    assertion_id: str
    name_id: str
    attributes: dict
    not_on_or_after: datetime
    session_index: Optional[str] = None


# --------------------------------------------------------------------------
# Certificate handling
# --------------------------------------------------------------------------


def normalize_certificate_pem(raw: str) -> str:
    """Admins sometimes paste just the base64 body without PEM headers -
    add them back if missing, so `signxml`/`cryptography` (which expect a
    well-formed PEM string) don't fail on an otherwise-valid certificate."""
    raw = (raw or "").strip()
    if "BEGIN CERTIFICATE" in raw:
        return raw
    body = "".join(raw.split())
    wrapped = "\n".join(body[i : i + 64] for i in range(0, len(body), 64))
    return f"-----BEGIN CERTIFICATE-----\n{wrapped}\n-----END CERTIFICATE-----\n"


# --------------------------------------------------------------------------
# AuthnRequest generation + HTTP-Redirect binding signing (exigence 6)
# --------------------------------------------------------------------------


def build_authn_request_xml(
    sp_entity_id: str,
    idp_sso_url: str,
    acs_url: str,
    request_id: Optional[str] = None,
    issue_instant: Optional[datetime] = None,
) -> tuple[str, bytes]:
    """Returns (request_id, xml_bytes). Built via lxml's Element API
    (never hand-assembled/string-formatted XML) to avoid injection/
    escaping bugs."""
    request_id = request_id or f"_{uuid.uuid4().hex}"
    issue_instant = issue_instant or datetime.now(dt_timezone.utc)

    nsmap = {"samlp": SAML_PROTOCOL_NS, "saml": SAML_ASSERTION_NS}
    root = etree.Element(f"{{{SAML_PROTOCOL_NS}}}AuthnRequest", nsmap=nsmap)
    root.set("ID", request_id)
    root.set("Version", "2.0")
    root.set("IssueInstant", issue_instant.strftime("%Y-%m-%dT%H:%M:%SZ"))
    root.set("Destination", idp_sso_url)
    root.set("AssertionConsumerServiceURL", acs_url)
    root.set("ProtocolBinding", "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST")

    issuer = etree.SubElement(root, f"{{{SAML_ASSERTION_NS}}}Issuer")
    issuer.text = sp_entity_id

    return request_id, etree.tostring(root, xml_declaration=False)


def build_authn_request_redirect_url(config, acs_url: str, relay_state: Optional[str] = None) -> tuple[str, str]:
    """Returns (redirect_url, request_id). HTTP-Redirect binding
    (exigence 6): deflate + base64 the AuthnRequest XML into `SAMLRequest`,
    then sign the query string `SAMLRequest=...&RelayState=...&SigAlg=...`
    (query-string signing per the SAML HTTP-Redirect binding spec - there
    is no XML envelope to embed a `ds:Signature` into on this binding,
    unlike the response side) with this instance's own SP signing key
    (`plane.utils.saml_keys`)."""
    request_id, xml_bytes = build_authn_request_xml(config.sp_entity_id, config.idp_sso_url, acs_url)

    deflater = zlib.compressobj(9, zlib.DEFLATED, -15)
    deflated = deflater.compress(xml_bytes) + deflater.flush()
    saml_request_b64 = base64.b64encode(deflated).decode()

    sig_alg_uri = SIGNATURE_ALGORITHM_URIS.get(config.signature_algorithm, SIGNATURE_ALGORITHM_URIS["rsa-sha256"])
    hash_alg_cls = SIGNATURE_HASH_ALGORITHMS.get(config.signature_algorithm, hashes.SHA256)

    params = [("SAMLRequest", saml_request_b64)]
    if relay_state:
        params.append(("RelayState", relay_state))
    params.append(("SigAlg", sig_alg_uri))

    query_to_sign = "&".join(f"{key}={quote_plus(value)}" for key, value in params)

    private_key_pem, _ = get_or_create_sp_signing_key()
    private_key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    signature = private_key.sign(query_to_sign.encode(), padding.PKCS1v15(), hash_alg_cls())
    signature_b64 = base64.b64encode(signature).decode()

    full_query = f"{query_to_sign}&Signature={quote_plus(signature_b64)}"
    return f"{config.idp_sso_url}?{full_query}", request_id


# --------------------------------------------------------------------------
# SAMLResponse / Assertion parsing + validation (exigence 7/8)
# --------------------------------------------------------------------------


def _verify_signed_element(raw_xml: bytes, cert_pem: str, expected_location: str):
    """Runs `XMLVerifier().verify()` with an EXPLICIT `location` (never
    relying on `signxml`'s own `.//`-anywhere-in-document default) and
    returns ONLY `result.signed_xml` - the exact node `signxml` itself
    verified the signature over. This is the "see what is signed" rule in
    practice: every caller in this module must extract claims from this
    return value alone, never from an independent re-search of the
    original document. Raises `signxml.exceptions.InvalidInput` if no
    Signature exists at `expected_location` (caller may fall back to a
    different location), or `InvalidSignature` (incl. its `InvalidDigest`/
    `InvalidCertificate` subclasses) if a signature IS present there but
    fails cryptographic/certificate validation - callers must treat that
    as a hard failure, never a "try somewhere else" signal."""
    expect_config = SignatureConfiguration(location=expected_location)
    result = XMLVerifier().verify(raw_xml, x509_cert=cert_pem, expect_config=expect_config)
    return result.signed_xml


def _parse_saml_datetime(value: str) -> datetime:
    parsed = dateutil_parser.isoparse(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_timezone.utc)
    return parsed


def _extract_conditions(assertion_node) -> tuple[Optional[datetime], Optional[datetime]]:
    conditions = assertion_node.find(f"{{{SAML_ASSERTION_NS}}}Conditions")
    if conditions is None:
        return None, None
    not_before_raw = conditions.get("NotBefore")
    not_on_or_after_raw = conditions.get("NotOnOrAfter")
    not_before = _parse_saml_datetime(not_before_raw) if not_before_raw else None
    not_on_or_after = _parse_saml_datetime(not_on_or_after_raw) if not_on_or_after_raw else None
    return not_before, not_on_or_after


def _extract_audiences(assertion_node) -> list:
    audiences = []
    conditions = assertion_node.find(f"{{{SAML_ASSERTION_NS}}}Conditions")
    if conditions is None:
        return audiences
    for restriction in conditions.findall(f"{{{SAML_ASSERTION_NS}}}AudienceRestriction"):
        for audience in restriction.findall(f"{{{SAML_ASSERTION_NS}}}Audience"):
            if audience.text:
                audiences.append(audience.text.strip())
    return audiences


def _extract_name_id(assertion_node) -> Optional[str]:
    subject = assertion_node.find(f"{{{SAML_ASSERTION_NS}}}Subject")
    if subject is None:
        return None
    name_id_el = subject.find(f"{{{SAML_ASSERTION_NS}}}NameID")
    if name_id_el is None or not name_id_el.text:
        return None
    return name_id_el.text.strip()


def _extract_session_index(assertion_node) -> Optional[str]:
    for stmt in assertion_node.findall(f"{{{SAML_ASSERTION_NS}}}AuthnStatement"):
        session_index = stmt.get("SessionIndex")
        if session_index:
            return session_index
    return None


def _extract_raw_attributes(assertion_node) -> dict:
    attributes = {}
    statement = assertion_node.find(f"{{{SAML_ASSERTION_NS}}}AttributeStatement")
    if statement is None:
        return attributes
    for attribute in statement.findall(f"{{{SAML_ASSERTION_NS}}}Attribute"):
        name = attribute.get("Name") or attribute.get("FriendlyName")
        if not name:
            continue
        values = [v.text.strip() for v in attribute.findall(f"{{{SAML_ASSERTION_NS}}}AttributeValue") if v.text]
        if not values:
            continue
        attributes[name] = values[0] if len(values) == 1 else values
    return attributes


def apply_attribute_mapping(raw_attributes: dict, attribute_mapping: dict) -> dict:
    mapped = {}
    for field_name in ("email", "first_name", "last_name"):
        source_name = (attribute_mapping or {}).get(field_name)
        if not source_name:
            continue
        value = raw_attributes.get(source_name)
        if isinstance(value, list):
            value = value[0] if value else None
        if value:
            mapped[field_name] = value
    return mapped


def verify_and_extract_assertion(raw_xml: bytes, config, *, now: Optional[datetime] = None) -> SAMLAssertionResult:
    """The main ACS validation entrypoint (exigence 7/8). Verifies the
    XML-DSig signature (Assertion-level first, falling back to
    Response-level - IdPs vary on which they sign), the validity window
    (`NotBefore`/`NotOnOrAfter` with `config.clock_skew_tolerance_seconds`
    tolerance), the audience restriction (must include
    `config.sp_entity_id`), and extracts the mapped attributes. Does NOT
    check/record replay - see `check_and_record_assertion` below, kept
    separate since it's the one step with a DB side effect, called by the
    ACS view only after every other check here has already passed."""
    now = now or datetime.now(dt_timezone.utc)
    cert_pem = normalize_certificate_pem(config.idp_certificate)

    assertion_node = None
    try:
        assertion_node = _verify_signed_element(
            raw_xml, cert_pem, expected_location=f"./{{{SAML_ASSERTION_NS}}}Assertion/"
        )
    except InvalidInput:
        # No Signature found at the Assertion location - fall back to a
        # Response-level signature below. Deliberately NOT catching
        # InvalidSignature here too: see this function's own "hard
        # failure, no fallback" note above `_verify_signed_element`.
        assertion_node = None
    except InvalidSignature as exc:
        raise SAMLValidationError("INVALID_SIGNATURE", f"Assertion signature verification failed: {exc}")
    except etree.XMLSyntaxError as exc:
        raise SAMLValidationError("MALFORMED_XML", f"Could not parse SAMLResponse XML: {exc}")

    if assertion_node is None:
        try:
            response_node = _verify_signed_element(raw_xml, cert_pem, expected_location="./")
        except InvalidInput:
            raise SAMLValidationError(
                "NO_SIGNATURE", "No valid XML signature found at the Assertion or Response level."
            )
        except InvalidSignature as exc:
            raise SAMLValidationError("INVALID_SIGNATURE", f"Response signature verification failed: {exc}")
        except etree.XMLSyntaxError as exc:
            raise SAMLValidationError("MALFORMED_XML", f"Could not parse SAMLResponse XML: {exc}")

        if response_node is None:
            raise SAMLValidationError("NO_SIGNATURE", "Signature verification produced no signed XML.")
        # Response-level signature verified: the Assertion CHILD OF THIS
        # VERIFIED NODE - never `response_node`'s original, unverified
        # source document - is what gets trusted from here on.
        assertion_node = response_node.find(f"{{{SAML_ASSERTION_NS}}}Assertion")
        if assertion_node is None:
            raise SAMLValidationError("NO_ASSERTION", "Signed Response contains no Assertion element.")

    assertion_id = assertion_node.get("ID")
    if not assertion_id:
        raise SAMLValidationError("MISSING_ASSERTION_ID", "Assertion has no ID attribute.")

    not_before, not_on_or_after = _extract_conditions(assertion_node)
    if not_on_or_after is None:
        # SAML core (2.0) section 2.5.1: Conditions/NotOnOrAfter defines
        # the assertion's validity window. Treat a missing one as
        # invalid rather than "valid forever".
        raise SAMLValidationError("MISSING_CONDITIONS", "Assertion has no Conditions/NotOnOrAfter.")

    skew = timedelta(seconds=config.clock_skew_tolerance_seconds)
    if not_before is not None and now < (not_before - skew):
        raise SAMLValidationError(
            "NOT_YET_VALID", f"Assertion not valid before {not_before.isoformat()} (now={now.isoformat()})."
        )
    if now >= (not_on_or_after + skew):
        raise SAMLValidationError(
            "EXPIRED", f"Assertion expired at {not_on_or_after.isoformat()} (now={now.isoformat()})."
        )

    audiences = _extract_audiences(assertion_node)
    if config.sp_entity_id not in audiences:
        raise SAMLValidationError(
            "WRONG_AUDIENCE", f"Assertion audience {audiences} does not include '{config.sp_entity_id}'."
        )

    name_id = _extract_name_id(assertion_node)
    if not name_id:
        raise SAMLValidationError("MISSING_NAME_ID", "Assertion has no Subject/NameID.")

    raw_attributes = _extract_raw_attributes(assertion_node)
    mapped_attributes = apply_attribute_mapping(raw_attributes, config.attribute_mapping)
    if not mapped_attributes.get("email"):
        raise SAMLValidationError("MISSING_EMAIL_ATTRIBUTE", "Mapped 'email' attribute missing or empty.")

    return SAMLAssertionResult(
        assertion_id=assertion_id,
        name_id=name_id,
        attributes=mapped_attributes,
        not_on_or_after=not_on_or_after,
        session_index=_extract_session_index(assertion_node),
    )


def check_and_record_assertion(config, assertion_result: SAMLAssertionResult) -> None:
    """Anti-replay (exigence 8). MUST be called after
    `verify_and_extract_assertion` succeeds and BEFORE the assertion's
    claims are used for anything else (JIT provisioning, test-connection
    reporting) - a replayed assertion is rejected even though its
    signature/validity-window/audience all check out. Race-safe: the
    check-then-insert gap is closed by `SAMLAssertionReplay.assertion_id`'s
    DB-level `unique=True` constraint - a concurrent replay of the exact
    same assertion loses the `IntegrityError` race and is rejected too."""
    from plane.license.models import SAMLAssertionReplay

    if SAMLAssertionReplay.objects.filter(assertion_id=assertion_result.assertion_id).exists():
        raise SAMLValidationError("REPLAYED", f"Assertion '{assertion_result.assertion_id}' already consumed.")

    try:
        SAMLAssertionReplay.objects.create(
            assertion_id=assertion_result.assertion_id,
            saml_configuration=config,
            expires_at=assertion_result.not_on_or_after,
        )
    except IntegrityError:
        raise SAMLValidationError("REPLAYED", f"Assertion '{assertion_result.assertion_id}' already consumed.")


# --------------------------------------------------------------------------
# SP metadata (exigence 5)
# --------------------------------------------------------------------------


def build_sp_metadata_xml(config, acs_url: str, sp_certificate_pem: Optional[str] = None) -> bytes:
    nsmap = {"md": "urn:oasis:names:tc:SAML:2.0:metadata", "ds": "http://www.w3.org/2000/09/xmldsig#"}
    root = etree.Element("{urn:oasis:names:tc:SAML:2.0:metadata}EntityDescriptor", nsmap=nsmap)
    root.set("entityID", config.sp_entity_id)

    spsso = etree.SubElement(root, "{urn:oasis:names:tc:SAML:2.0:metadata}SPSSODescriptor")
    spsso.set("protocolSupportEnumeration", SAML_PROTOCOL_NS)
    spsso.set("AuthnRequestsSigned", "true")
    spsso.set("WantAssertionsSigned", "true")

    if sp_certificate_pem:
        key_descriptor = etree.SubElement(spsso, "{urn:oasis:names:tc:SAML:2.0:metadata}KeyDescriptor")
        key_descriptor.set("use", "signing")
        key_info = etree.SubElement(key_descriptor, "{http://www.w3.org/2000/09/xmldsig#}KeyInfo")
        x509_data = etree.SubElement(key_info, "{http://www.w3.org/2000/09/xmldsig#}X509Data")
        x509_certificate = etree.SubElement(x509_data, "{http://www.w3.org/2000/09/xmldsig#}X509Certificate")
        cert_body = "".join(
            line
            for line in sp_certificate_pem.splitlines()
            if line and "BEGIN CERTIFICATE" not in line and "END CERTIFICATE" not in line
        )
        x509_certificate.text = cert_body

    acs = etree.SubElement(spsso, "{urn:oasis:names:tc:SAML:2.0:metadata}AssertionConsumerService")
    acs.set("Binding", "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST")
    acs.set("Location", acs_url)
    acs.set("index", "0")
    acs.set("isDefault", "true")

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=True)
