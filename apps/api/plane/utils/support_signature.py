# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Inbound support-webhook signature verification (Zendesk/Front/generic) -
see docs/feature-specs/07-integrations-git.md ("6. Pont support client
type Zendesk/Front", exigence 8) in plane-selfhost.

Each provider's algorithm below was independently verified against that
provider's own published docs (fetched live during this session, real
outbound HTTPS access confirmed for `zendesk.com`/`frontapp.com`):

- **Zendesk** (developer.zendesk.com, "Verifying webhook signatures"):
  headers `X-Zendesk-Webhook-Signature` + `X-Zendesk-Webhook-Signature-Timestamp`,
  signature = base64(HMAC-SHA256(secret, timestamp + raw_body)) - the
  timestamp is concatenated *before* the body, not sent as a separate
  factor the way Slack's `v0:timestamp:body` scheme joins them with
  colons.
- **Front**: Front actually documents two different, incompatible
  schemes depending on which webhook mechanism is used -
  "Rule webhooks" (a Rule's "Notify webhook" action, no Front
  "Application"/marketplace registration required) sign with
  `X-Front-Signature` = base64(HMAC-**SHA1**(api_secret, raw_body));
  "Application webhooks" (needs a registered Front Application) sign
  with the same header but HMAC-**SHA256** over
  `f"{timestamp}:".encode() + raw_body`, keyed by a distinct "signing
  key". This connector targets **Rule webhooks** specifically (the
  spec's own connector model has no separate "Front Application"
  registration concept, and registering a real Front Application needs
  the same kind of publicly-reachable-callback ceremony this sandbox
  cannot complete) - `verify_front_signature` below implements the
  Rule-webhook HMAC-SHA1 scheme. If a future iteration wants Application
  webhooks instead, that is a different, additive verification function,
  not a change to this one.
- **generic_webhook**: no third-party doc to defer to (there is no fixed
  "generic" provider) - reuses this fork's own existing outbound
  convention instead (`plane.bgtasks.webhook_task.sign_webhook_payload`):
  hex HMAC-SHA256 over the raw body, header name documented on the
  connector's own config screen (`X-Webhook-Signature`) rather than
  invented ad-hoc.
"""

import base64
import hashlib
import hmac


def verify_zendesk_signature(webhook_secret, timestamp, raw_body, provided_signature_b64):
    if not webhook_secret or not timestamp or not provided_signature_b64:
        return False

    if isinstance(raw_body, bytes):
        raw_body = raw_body.decode("utf-8")

    signing_string = f"{timestamp}{raw_body}".encode("utf-8")
    computed = base64.b64encode(hmac.new(webhook_secret.encode("utf-8"), signing_string, hashlib.sha256).digest())

    try:
        provided = provided_signature_b64.encode("utf-8")
    except AttributeError:
        return False

    return hmac.compare_digest(computed, provided)


def verify_front_signature(api_secret, raw_body, provided_signature_b64):
    """Front "Rule webhook" scheme - see module docstring."""
    if not api_secret or not provided_signature_b64:
        return False

    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")

    computed = base64.b64encode(hmac.new(api_secret.encode("utf-8"), raw_body, hashlib.sha1).digest())

    try:
        provided = provided_signature_b64.encode("utf-8")
    except AttributeError:
        return False

    return hmac.compare_digest(computed, provided)


def verify_generic_webhook_signature(webhook_secret, raw_body, provided_signature_hex):
    """generic_webhook provider - see module docstring for why this reuses
    this fork's own outbound HMAC convention rather than a third-party
    one."""
    if not webhook_secret or not provided_signature_hex:
        return False

    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")

    computed = hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    return hmac.compare_digest(computed, provided_signature_hex)


def verify_support_webhook_signature(provider, webhook_secret, headers, raw_body):
    """
    Dispatches to the right provider-specific verifier based on
    `provider` (one of `WorkspaceSupportConnector.provider`'s choices).
    `headers` is a case-insensitive mapping (e.g. `request.headers`).
    Returns False (never raises) for an unrecognized provider or missing
    header - the caller always treats False as "reject with 401".
    """
    if provider == "zendesk":
        return verify_zendesk_signature(
            webhook_secret,
            headers.get("X-Zendesk-Webhook-Signature-Timestamp"),
            raw_body,
            headers.get("X-Zendesk-Webhook-Signature"),
        )
    if provider == "front":
        return verify_front_signature(webhook_secret, raw_body, headers.get("X-Front-Signature"))
    if provider == "generic_webhook":
        return verify_generic_webhook_signature(webhook_secret, raw_body, headers.get("X-Webhook-Signature"))
    return False
