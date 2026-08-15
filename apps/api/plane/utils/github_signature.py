# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
GitHub webhook signature verification - see
docs/feature-specs/07-integrations-git.md ("1. GitHub natif", exigence 7)
in plane-selfhost: "Le webhook entrant DOIT verifier la signature HMAC
(X-Hub-Signature-256) du payload GitHub avec le secret propre au depot
synchronise avant tout traitement".

Algorithm per GitHub's own docs
(https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries):
`sha256=` + hex(HMAC-SHA256(secret, raw_request_body)). Pure function,
independently verified in this patch's test suite by hand-computing the
expected signature with the same algorithm and confirming this function
accepts a valid one and rejects a tampered one - see the "Testing" section
of this feature's README for the exact commands run.

Mirrors the shape of `plane.utils.slack_signature.verify_slack_signature`
(the one other real, working inbound-webhook-signature precedent in this
codebase) but is a genuinely different algorithm (no timestamp, different
prefix format, different hash construction) - kept as its own module
rather than folded into that one.
"""

import hashlib
import hmac

SIGNATURE_PREFIX = "sha256="


def verify_github_signature(secret, raw_body, provided_signature):
    """
    `secret` - the per-`GithubRepositoryProjectSync` webhook secret
    (decrypted plaintext).
    `raw_body` - the exact raw request body bytes GitHub signed (must be
    the untouched bytes, not a re-serialized/re-parsed version - any
    difference, even whitespace, changes the signature).
    `provided_signature` - the raw `X-Hub-Signature-256` header value,
    expected to look like `sha256=<hex digest>`.

    Returns False (never raises) for any malformed input - a missing
    secret/body/header, or a header without the expected prefix, is
    treated as "does not verify", not an error.
    """
    if not secret or not provided_signature:
        return False

    if not provided_signature.startswith(SIGNATURE_PREFIX):
        return False

    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    if isinstance(secret, str):
        secret = secret.encode("utf-8")

    computed = SIGNATURE_PREFIX + hmac.new(secret, raw_body, hashlib.sha256).hexdigest()

    return hmac.compare_digest(computed, provided_signature)
