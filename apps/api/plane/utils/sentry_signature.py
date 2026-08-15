# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Sentry inbound webhook signature verification - see
docs/feature-specs/07-integrations-git.md ("5. Integration Sentry
native", exigence 11) in plane-selfhost.

Algorithm independently verified against Sentry's own published docs
(docs.sentry.io, "Webhooks" under Integration Platform, fetched live
during this session - see the PR/session notes for the exact quoted
snippet): the `Sentry-Hook-Signature` header is the **hex** HMAC-SHA256
digest of the raw (unparsed) request body, keyed by the Internal
Integration's Client Secret - i.e. `hmac.new(secret, raw_body,
sha256).hexdigest()`. This is the same shape as this fork's own outbound
webhook signing (`plane.bgtasks.webhook_task.sign_webhook_payload`) and
the pre-existing Slack inbound precedent
(`plane.utils.slack_signature.verify_slack_signature`) - hex HMAC-SHA256,
just without Slack's `v0:timestamp:body` prefix or replay-window check
(Sentry's own docs don't document a timestamp header for this signature,
unlike Slack/Zendesk).
"""

import hashlib
import hmac


def verify_sentry_signature(client_secret, raw_body, provided_signature):
    """
    `raw_body` must be the exact, unparsed request body bytes (or the
    str Sentry hashed - UTF-8 either way) - never a value that has been
    round-tripped through `json.dumps(json.loads(...))`, which does not
    reproduce Sentry's own byte-for-byte serialization and would make
    every signature check fail.
    """
    if not client_secret or not provided_signature:
        return False

    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")

    computed_signature = hmac.new(client_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    return hmac.compare_digest(computed_signature, provided_signature)
