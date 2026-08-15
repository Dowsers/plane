# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Thin Sentry Web API client - see docs/feature-specs/07-integrations-git.md
("5. Integration Sentry native") in plane-selfhost.

Endpoints and error-response shapes below were verified against the real
`sentry.io` API during this session (this sandbox has genuine outbound
HTTPS access to it - see the session's own network-access findings):
- `GET /api/0/organizations/{org_slug}/` with no `Authorization` header
  returns HTTP 401 `{"detail": "Authentication credentials were not
  provided."}`.
- The same call with a syntactically-plausible but invalid bearer token
  returns HTTP 401 `{"detail": "Invalid org token"}`.
- `PUT /api/0/organizations/{org_slug}/issues/{issue_id}/` is the real,
  documented, organization-scoped "Update an Issue" endpoint (per
  docs.sentry.io, fetched live) - not the older bare
  `/api/0/issues/{issue_id}/` path.
Both real response shapes are parsed identically here via `.get("detail")`
with a raw-text fallback, so a real 401 from either case surfaces a
readable message rather than a raw traceback.
"""

import requests


class SentryAPIError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _base_url(base_url):
    return (base_url or "https://sentry.io").rstrip("/")


def _headers(api_token):
    return {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}


def _raise_for_error(response):
    if response.ok:
        return
    detail = None
    try:
        body = response.json()
        if isinstance(body, dict):
            detail = body.get("detail") or body.get("error") or body.get("message")
    except ValueError:
        pass
    detail = detail or response.text or f"HTTP {response.status_code}"
    raise SentryAPIError(detail, status_code=response.status_code)


def list_org_projects(base_url, org_slug, api_token, timeout=10):
    """
    Used both to validate a token at connect-time (exigence 1 - "le token
    est validé par un appel test à l'API Sentry") and to populate the
    project-selection dropdown (Considerations API/UX). Requires the
    `project:read` scope, one of the spec's own stated minimum scopes.
    """
    url = f"{_base_url(base_url)}/api/0/organizations/{org_slug}/projects/"
    try:
        response = requests.get(url, headers=_headers(api_token), timeout=timeout)
    except requests.RequestException as e:
        raise SentryAPIError(str(e)) from e
    _raise_for_error(response)
    return response.json()


def update_issue_status(base_url, org_slug, sentry_issue_id, status, api_token, timeout=10):
    """
    `status` is one of Sentry's own documented values (`resolved`,
    `unresolved`, `ignored`, ...) - this integration only ever sends
    `resolved`/`ignored`/`unresolved` (exigence 5/6). Requires the
    `event:write` (or `event:admin`) scope.
    """
    url = f"{_base_url(base_url)}/api/0/organizations/{org_slug}/issues/{sentry_issue_id}/"
    try:
        response = requests.put(url, headers=_headers(api_token), json={"status": status}, timeout=timeout)
    except requests.RequestException as e:
        raise SentryAPIError(str(e)) from e
    _raise_for_error(response)
    return response.json()


def get_issue(base_url, org_slug, sentry_issue_id, api_token, timeout=10):
    """Used by the manual/periodic refresh path and by the connect-time
    validation of an individual project mapping."""
    url = f"{_base_url(base_url)}/api/0/organizations/{org_slug}/issues/{sentry_issue_id}/"
    try:
        response = requests.get(url, headers=_headers(api_token), timeout=timeout)
    except requests.RequestException as e:
        raise SentryAPIError(str(e)) from e
    _raise_for_error(response)
    return response.json()
