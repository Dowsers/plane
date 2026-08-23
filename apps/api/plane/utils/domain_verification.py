# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 6 ("Politiques de securite configurables"),
decision #3 - SHARED, model-agnostic domain-ownership verification
utility.

Used today only by `WorkspaceVerifiedDomain` (this feature), but written
without importing, or referencing, that model (or any Django model at all)
so a future SAML feature's own `SAMLVerifiedDomain` can call these same
functions without duplicating the DNS-TXT-lookup / HTML-file-fetch
mechanics - callers own persistence entirely; this module only proves or
disproves ownership of a domain string given a token, and returns a plain
`(bool, str)` result.

Two methods, matching the spec's own exigence 2:
- `DNS_TXT`: look up `TXT` records for `domain` and check for one exactly
  equal to `plane-verify=<token>`.
- `HTML_FILE`: fetch a well-known path under the domain
  (`/.well-known/plane-verify-<token>.txt`) and check the response body
  contains the token. SSRF-guarded via the existing
  `plane.utils.ip_address.validate_url` - the same guard this codebase's
  outbound webhook calls already go through - since this is an
  Owner-triggered outbound HTTP request to an arbitrary user-supplied
  domain.

Synchronous by design (see
`plane.app.views.workspace.security.WorkspaceVerifiedDomainVerifyEndpoint`'s
own docstring for the full reasoning) - both lookups use a short, bounded
timeout (5s default) and never raise for expected failure modes (NXDOMAIN,
no matching record, timeout, connection error); they only raise for
genuine programmer errors. Callers decide synchronously-block-the-request
vs. Celery-task-plus-polling; this module has no opinion either way.
"""

import logging
import secrets
from typing import Optional, Tuple

import dns.exception
import dns.resolver
import requests

from plane.utils.ip_address import validate_url

logger = logging.getLogger("plane.utils.domain_verification")

DNS_TIMEOUT_SECONDS = 5
HTTP_TIMEOUT_SECONDS = 5
TOKEN_PREFIX = "plane-verify"


def generate_verification_token() -> str:
    """32 hex chars - short enough to sit comfortably inside a single DNS
    TXT record alongside the `plane-verify=` prefix (a TXT record's single
    character-string is capped at 255 bytes), long enough not to be
    guessable."""
    return secrets.token_hex(16)


def dns_txt_record_value(token: str) -> str:
    """The exact TXT record VALUE an Owner must publish - the record NAME
    is the bare domain itself (no subdomain), matching the spec's own
    `plane-verify=<token>` wording."""
    return f"{TOKEN_PREFIX}={token}"


def html_file_path(token: str) -> str:
    """Path (not a full URL - callers supply the scheme/domain) the
    `HTML_FILE` method expects a plain-text file containing the token to be
    served at. A deterministic, well-known path (rather than a
    user-chosen URL) so the UI can tell the Owner exactly where to place
    the file without any free-form URL entry - matching how e.g. Google
    Search Console's own HTML-file verification method works."""
    return f"/.well-known/{TOKEN_PREFIX}-{token}.txt"


def verify_dns_txt(domain: str, token: str, timeout: int = DNS_TIMEOUT_SECONDS) -> Tuple[bool, str]:
    """Returns `(success, detail)`. `detail` is a short, user-facing reason
    on failure."""
    expected = dns_txt_record_value(token)
    resolver = dns.resolver.Resolver()
    resolver.timeout = timeout
    resolver.lifetime = timeout
    try:
        answers = resolver.resolve(domain, "TXT")
    except dns.resolver.NXDOMAIN:
        return False, f"Domain '{domain}' does not exist."
    except dns.resolver.NoAnswer:
        return False, f"No TXT records found for '{domain}'."
    except dns.exception.Timeout:
        return False, "DNS lookup timed out."
    except dns.exception.DNSException as exc:
        logger.warning("DNS TXT lookup failed for domain '%s': %s", domain, exc)
        return False, f"DNS lookup failed: {exc}"

    for rdata in answers:
        # dnspython represents a TXT rdata as one-or-more quoted
        # character-strings (`rdata.strings`, a tuple of bytes) - join
        # them the way a single logical TXT value reads.
        value = b"".join(rdata.strings).decode("utf-8", errors="ignore")
        if value.strip() == expected:
            return True, "DNS TXT record verified."

    return False, f"No TXT record matching '{expected}' found for '{domain}'."


def verify_html_file(domain: str, token: str, timeout: int = HTTP_TIMEOUT_SECONDS) -> Tuple[bool, str]:
    """Tries HTTPS first, falls back to HTTP - a freshly-claimed
    self-hosted domain without a TLS certificate yet is a realistic case
    here, unlike most of this codebase's other outbound HTTP calls."""
    path = html_file_path(token)
    last_error = f"Verification file not found at '{path}' (tried HTTPS then HTTP)."
    for scheme in ("https", "http"):
        url = f"{scheme}://{domain}{path}"
        try:
            validate_url(url)
        except ValueError as exc:
            return False, f"Refused to fetch verification file: {exc}"
        try:
            response = requests.get(url, timeout=timeout)
        except requests.RequestException as exc:
            last_error = f"Could not reach '{url}': {exc}"
            continue
        if response.status_code == 200 and token in response.text:
            return True, f"Verification file found at '{url}'."
        last_error = f"'{url}' returned status {response.status_code} or did not contain the token."
    return False, last_error


def verify_domain_ownership(
    domain: str, method: str, token: str, timeout: Optional[int] = None
) -> Tuple[bool, str]:
    """Dispatches to the method-specific check. `method` is a plain string
    (`"DNS_TXT"` / `"HTML_FILE"`) rather than importing
    `DomainVerificationMethod` from `plane.db.models` - keeps this module
    genuinely model-agnostic, per decision #3."""
    domain = (domain or "").strip().lower()
    if not domain:
        return False, "Domain is required."

    if method == "DNS_TXT":
        return verify_dns_txt(domain, token, timeout=timeout or DNS_TIMEOUT_SECONDS)
    if method == "HTML_FILE":
        return verify_html_file(domain, token, timeout=timeout or HTTP_TIMEOUT_SECONDS)
    return False, f"Unknown verification method: {method}"
