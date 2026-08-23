# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

Shared token generation/hashing helpers - imported by BOTH the admin-facing
token-creation endpoint (`plane.app.views.workspace.scim_admin`, session-
authenticated, normal `plane.app` conventions) and the SCIM protocol
authentication class (`plane.scim.authentication.SCIMTokenAuthentication`).
Living in `plane.utils` (not inside either of those two packages) avoids a
`plane.app` <-> `plane.scim` import in either direction.

Decision #2 - `SCIMToken.token_hash` is a genuine SHA-256 HMAC digest of the
raw token, never the raw value itself, unlike `APIToken.token` (confirmed
by this initiative's prior research to be stored in plaintext - a
pre-existing gap in this codebase, not something to copy here). HMAC (not a
plain `hashlib.sha256(token).hexdigest()`) is used so the digest also
depends on `settings.SECRET_KEY` - lookup is still a single indexed
equality query (same shape as `APIToken.token`'s own lookup), but a stolen
database dump alone cannot be used to forge a valid token via a precomputed
table, since the attacker would also need the instance's `SECRET_KEY`.
"""

import hashlib
import hmac
import secrets

from django.conf import settings

SCIM_TOKEN_PREFIX = "scim_"


def generate_scim_token() -> str:
    """A fresh, cryptographically random raw SCIM Bearer token. Only ever
    returned to the caller once, at creation time - see
    `plane.app.serializers.scim.SCIMTokenWriteSerializer`."""
    return SCIM_TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_scim_token(raw_token: str) -> str:
    """Deterministic HMAC-SHA256 digest (hex) of `raw_token`, keyed on this
    instance's own `SECRET_KEY`. Used both to WRITE `SCIMToken.token_hash`
    at creation time and to LOOK UP a token from an incoming `Authorization:
    Bearer <raw>` header - both call sites must hash identically, hence one
    shared function rather than two independent implementations that could
    drift."""
    return hmac.new(
        key=settings.SECRET_KEY.encode("utf-8"),
        msg=raw_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
