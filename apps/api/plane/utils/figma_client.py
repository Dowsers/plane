# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Thin wrapper around the real Figma REST API (https://api.figma.com/v1) for
docs/feature-specs/07-integrations-git.md ("4. Plugin Figma") in
plane-selfhost. Every function does a genuine HTTPS call - independently
verified live (see docker/api/figma-integration/README.md):
- GET https://api.figma.com/v1/me with a fake token -> real
  `{"status": 403, "err": "Invalid token"}` (real HTTP 403), confirming
  the error shape `_get`/`post_comment` rely on.
- POST https://api.figma.com/v1/oauth/token with bogus params -> real
  `{"error": "invalid_grant", "error_description": "..."}` (real HTTP
  400). Figma's own developer docs page prose reads as if the OAuth
  token endpoint were under www.figma.com/api/oauth/ - it is NOT: that
  path returns a plain-text 404 "Not Found" (verified live, a different
  response shape entirely from a real-but-rejected request), while
  api.figma.com/v1/oauth/token is the real, live endpoint. Getting this
  wrong before live-testing it would have shipped a connect flow that
  fails with a confusing 404 instead of a real Figma error message on
  every single attempt, even with valid credentials.
"""

import requests

FIGMA_API_BASE = "https://api.figma.com/v1"
FIGMA_OAUTH_BASE = "https://api.figma.com/v1/oauth"
DEFAULT_TIMEOUT = 10


class FigmaAPIError(Exception):
    """Raised on a non-2xx response from api.figma.com. `status`/`err`
    mirror Figma's own real error body shape, e.g.
    `{"status": 403, "err": "Invalid token"}`."""

    def __init__(self, status_code, err, response=None):
        self.status_code = status_code
        self.err = err
        self.response = response or {}
        super().__init__(f"Figma API error {status_code}: {err}")


def _get(path, token, params=None):
    response = requests.get(
        f"{FIGMA_API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params or {},
        timeout=DEFAULT_TIMEOUT,
    )
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.status_code >= 400:
        raise FigmaAPIError(response.status_code, data.get("err", response.text), response=data)
    return data


def get_me(token):
    """Real call used to validate a token and resolve the connecting
    Figma user's id/handle at connect time."""
    return _get("/me", token)


def get_file(token, file_key):
    return _get(f"/files/{file_key}", token)


def get_file_nodes(token, file_key, node_ids):
    return _get(f"/files/{file_key}/nodes", token, params={"ids": ",".join(node_ids)})


def get_images(token, file_key, node_ids, image_format="png"):
    """Thumbnail rendering - used to refresh `FigmaFileLink.thumbnail_url`."""
    return _get(f"/images/{file_key}", token, params={"ids": ",".join(node_ids), "format": image_format})


def post_comment(token, file_key, message, client_meta=None):
    """Posts a comment on a Figma file/node - the best-effort fallback
    (exigence 6) used when a status change can't reach a live canvas
    widget. Real POST, still untestable end-to-end here (needs a real
    file_key the token actually has access to)."""
    payload = {"message": message}
    if client_meta:
        payload["client_meta"] = client_meta
    response = requests.post(
        f"{FIGMA_API_BASE}/files/{file_key}/comments",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=DEFAULT_TIMEOUT,
    )
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.status_code >= 400:
        raise FigmaAPIError(response.status_code, data.get("err", response.text), response=data)
    return data


def exchange_code_for_token(client_id, client_secret, code, redirect_uri):
    """Real OAuth2 authorization-code exchange
    (https://api.figma.com/v1/oauth/token - see this module's docstring
    for why that's the real endpoint, not the one Figma's own docs prose
    suggests). Untestable end-to-end in this sandbox - needs a registered
    Figma app and a real `code` only Figma's own redirect can produce.
    Gated behind FIGMA_CLIENT_ID/FIGMA_CLIENT_SECRET, see
    FigmaOAuthCallbackEndpoint."""
    response = requests.post(
        f"{FIGMA_OAUTH_BASE}/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
            "grant_type": "authorization_code",
        },
        timeout=DEFAULT_TIMEOUT,
    )
    data = response.json()
    if response.status_code >= 400:
        raise FigmaAPIError(
            response.status_code, data.get("error_description", data.get("error", response.text)), response=data
        )
    return data


def refresh_access_token(client_id, client_secret, refresh_token):
    response = requests.post(
        f"{FIGMA_OAUTH_BASE}/refresh",
        data={"client_id": client_id, "client_secret": client_secret, "refresh_token": refresh_token},
        timeout=DEFAULT_TIMEOUT,
    )
    data = response.json()
    if response.status_code >= 400:
        raise FigmaAPIError(
            response.status_code, data.get("error_description", data.get("error", response.text)), response=data
        )
    return data
