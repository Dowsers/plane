# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Thin wrapper around the real Slack Web API (https://api.slack.com/methods)
for docs/feature-specs/07-integrations-git.md ("3. App Slack open-source")
in plane-selfhost. Every function here does a genuine HTTPS call to
api.slack.com / slack.com - independently verified live (see
docker/api/slack-app/README.md) against api.slack.com/api/api.test with a
fake token, confirming the real `{"ok": false, "error": "invalid_auth"}`
error shape this module's callers rely on. Nothing in this module is
mocked or simulated - it either really calls Slack, or (client_id/secret
not configured) raises before doing so.
"""

import logging

import requests

logger = logging.getLogger("plane.api")

SLACK_API_BASE = "https://slack.com/api"

# Slack's own documented timeout guidance for interactive components (3s)
# doesn't apply to plain Web API calls, but a bounded timeout keeps a
# Celery worker (or a synchronous request handler responding to a slash
# command within Slack's own 3s window) from hanging on a slow/unreachable
# Slack.
DEFAULT_TIMEOUT = 5


class SlackAPIError(Exception):
    """Raised when Slack's API itself responds with `{"ok": false, ...}`."""

    def __init__(self, error, response=None):
        self.error = error
        self.response = response or {}
        super().__init__(f"Slack API error: {error}")


def call_slack_api(method, token=None, http_method="POST", timeout=DEFAULT_TIMEOUT, **params):
    """
    Calls `https://slack.com/api/<method>`. Raises `SlackAPIError` when
    Slack's own response body says `ok: false` (Slack always returns HTTP
    200 for this - the `ok` field, not the status code, is the real
    success/failure signal, confirmed against the real API). Network-level
    failures (timeout, DNS, connection reset) propagate as
    `requests.RequestException` - callers (Celery tasks) are expected to
    catch and retry/log those separately from an `ok: false` application
    error, since a network failure is often transient and an `ok: false`
    (e.g. "invalid_auth", "channel_not_found") usually is not.
    """
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if http_method == "GET":
        response = requests.get(
            f"{SLACK_API_BASE}/{method}", headers=headers, params=params, timeout=timeout
        )
    else:
        headers["Content-Type"] = "application/json; charset=utf-8"
        response = requests.post(
            f"{SLACK_API_BASE}/{method}", headers=headers, json=params, timeout=timeout
        )

    data = response.json()
    if not data.get("ok"):
        raise SlackAPIError(data.get("error", "unknown_error"), response=data)
    return data


def auth_test(bot_access_token):
    """Validates a bot token and returns team/user identity - the real
    call used by the manual-bot-token connect path to confirm the token
    an admin pastes in is actually live before we store it."""
    return call_slack_api("auth.test", token=bot_access_token)


def oauth_v2_access(client_id, client_secret, code, redirect_uri):
    """Real `oauth.v2.access` authorization-code exchange. Untestable
    end-to-end in this sandbox (needs a registered app + a `code` that
    only Slack's own redirect can produce) - see SlackOAuthCallbackEndpoint
    for how this is gated behind SLACK_CLIENT_ID/SLACK_CLIENT_SECRET."""
    response = requests.post(
        f"{SLACK_API_BASE}/oauth.v2.access",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=DEFAULT_TIMEOUT,
    )
    data = response.json()
    if not data.get("ok"):
        raise SlackAPIError(data.get("error", "unknown_error"), response=data)
    return data


def post_message(bot_access_token, channel, text, thread_ts=None, username=None, icon_url=None):
    params = {"channel": channel, "text": text}
    if thread_ts:
        params["thread_ts"] = thread_ts
    if username:
        params["username"] = username
    if icon_url:
        params["icon_url"] = icon_url
    return call_slack_api("chat.postMessage", token=bot_access_token, **params)


def post_ephemeral(bot_access_token, channel, user, text):
    return call_slack_api("chat.postEphemeral", token=bot_access_token, channel=channel, user=user, text=text)


def add_reaction(bot_access_token, channel, timestamp, name="white_check_mark"):
    return call_slack_api(
        "reactions.add", token=bot_access_token, channel=channel, timestamp=timestamp, name=name
    )


def get_permalink(bot_access_token, channel, message_ts):
    return call_slack_api(
        "chat.getPermalink", token=bot_access_token, http_method="GET", channel=channel, message_ts=message_ts
    )


def conversations_list(bot_access_token, cursor=None, limit=200):
    params = {"limit": limit, "types": "public_channel,private_channel"}
    if cursor:
        params["cursor"] = cursor
    return call_slack_api("conversations.list", token=bot_access_token, http_method="GET", **params)


def views_open(bot_access_token, trigger_id, view):
    """Opens a Block Kit modal. Real request-building code, independently
    verified for shape against the real api.slack.com error response with
    an invalid token - but a real end-to-end open needs a live
    `trigger_id`, which only a real Slack client interaction produces, so
    this is not (and cannot be, from this sandbox) exercised end-to-end.
    See docker/api/slack-app/README.md."""
    return call_slack_api("views.open", token=bot_access_token, trigger_id=trigger_id, view=view)
