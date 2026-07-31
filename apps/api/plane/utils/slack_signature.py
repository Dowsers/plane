# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import hashlib
import hmac
import time

# Slack rejects (and so do we) requests whose timestamp is older than this,
# to prevent replay attacks - same window Slack's own docs recommend.
MAX_REQUEST_AGE_SECONDS = 60 * 5


def verify_slack_signature(signing_secret, timestamp, raw_body, provided_signature):
    """
    Verifies a Slack Events API / interactivity request signature, per
    Slack's documented algorithm (https://api.slack.com/authentication/verifying-requests-from-slack).
    Pure function, independently verified against Slack's own published
    worked example - see docker/api/omnichannel-intake-skeleton/README.md
    in plane-selfhost for how, since this is the one piece of the Feature 5
    skeleton that's actually testable without a live Slack app.
    """
    if not signing_secret or not timestamp or not provided_signature:
        return False

    try:
        if abs(time.time() - float(timestamp)) > MAX_REQUEST_AGE_SECONDS:
            return False
    except (TypeError, ValueError):
        return False

    basestring = f"v0:{timestamp}:{raw_body}"
    computed_signature = "v0=" + hmac.new(
        signing_secret.encode("utf-8"), basestring.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(computed_signature, provided_signature)
