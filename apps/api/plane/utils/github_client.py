# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Thin GitHub REST API v3 client for the GitHub native PR<->issue linking
feature - see docs/feature-specs/07-integrations-git.md ("1. GitHub
natif") in plane-selfhost.

Every call here happens synchronously inside a request/response cycle
(connecting a workspace, listing repos for the picker, registering/
deleting a webhook when a project sync is created/deleted) - not a
Celery task - so retry/backoff is a small, bounded, in-process loop
(`settings.GIT_INTEGRATION_API_MAX_RETRIES`, default 3) rather than
Celery's own `autoretry_for`/`retry_backoff` (used instead by
`plane.bgtasks.webhook_task.webhook_send_task` for Plane's own *outbound*
webhook deliveries, which really do run as a background task with no
caller waiting on an HTTP response).

`GithubAPIError` carries the real upstream status code and parsed body
so callers (views) can surface GitHub's own error message
(`{"message": "...", "documentation_url": "..."}` - confirmed against the
real API, see this feature's README "Testing" section) instead of a
generic 500.
"""

import time

import requests

from django.conf import settings

GITHUB_API_BASE = "https://api.github.com"
_RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
_REQUEST_TIMEOUT_SECONDS = 15


class GithubAPIError(Exception):
    def __init__(self, status_code, message, payload=None):
        self.status_code = status_code
        self.message = message
        self.payload = payload or {}
        super().__init__(f"GitHub API error {status_code}: {message}")


def _headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Plane-GitHub-Integration",
    }


def _request(method, url, token, **kwargs):
    max_retries = getattr(settings, "GIT_INTEGRATION_API_MAX_RETRIES", 3)
    last_response = None
    for attempt in range(max_retries + 1):
        try:
            response = requests.request(
                method, url, headers=_headers(token), timeout=_REQUEST_TIMEOUT_SECONDS, **kwargs
            )
        except requests.RequestException as e:
            if attempt >= max_retries:
                raise GithubAPIError(0, str(e)) from e
            time.sleep(min(2**attempt, 8))
            continue

        if response.status_code in _RETRYABLE_STATUSES and attempt < max_retries:
            last_response = response
            time.sleep(min(2**attempt, 8))
            continue

        return response

    # Exhausted retries on a retryable status - surface the last response
    # we actually got rather than raising a generic timeout.
    return last_response


def _parse_error(response):
    try:
        payload = response.json()
        message = payload.get("message", response.text)
    except ValueError:
        payload = {}
        message = response.text
    return GithubAPIError(response.status_code, message, payload)


def get_authenticated_user(token):
    """`GET /user` - used at connect-time to populate
    `GithubWorkspaceConnection.github_account_login`/`github_account_type`.
    Returns GitHub's own user object (`login`, `type` - "User" or
    "Organization", ...). Raises `GithubAPIError` on a bad/expired token -
    confirmed against the real API with an invalid token during this
    feature's own testing (see the README): GitHub returns
    `{"message": "Bad credentials", ...}` with a 401, which `_parse_error`
    surfaces verbatim rather than crashing."""
    response = _request("GET", f"{GITHUB_API_BASE}/user", token)
    if response.status_code != 200:
        raise _parse_error(response)
    return response.json()


def list_repositories(token):
    """Returns a flat list of repo dicts (`id`, `full_name`, `html_url`,
    `default_branch`, `private`) accessible to `token`, across every page
    (capped at 10 pages / ~1000 repos - documented limitation, a v1
    self-hosted connector has no pressing need for unbounded pagination
    here and an unbounded loop against a hostile/misconfigured token
    would otherwise never terminate)."""
    repos = []
    url = f"{GITHUB_API_BASE}/user/repos?per_page=100&affiliation=owner,collaborator,organization_member"
    for _ in range(10):
        response = _request("GET", url, token)
        if response.status_code != 200:
            raise _parse_error(response)
        repos.extend(response.json())
        next_url = _next_page_url(response.headers.get("Link"))
        if not next_url:
            break
        url = next_url
    return [
        {
            "github_repo_id": r["id"],
            "full_name": r["full_name"],
            "html_url": r["html_url"],
            "default_branch": r.get("default_branch", "main"),
            "private": r.get("private", False),
        }
        for r in repos
    ]


def get_repository(token, full_name):
    response = _request("GET", f"{GITHUB_API_BASE}/repos/{full_name}", token)
    if response.status_code != 200:
        raise _parse_error(response)
    return response.json()


def get_pull_request(token, full_name, number):
    response = _request("GET", f"{GITHUB_API_BASE}/repos/{full_name}/pulls/{number}", token)
    if response.status_code != 200:
        raise _parse_error(response)
    return response.json()


def list_pull_request_commit_messages(token, full_name, number):
    """Returns just the commit message strings (exigence 1's "les commits
    d'une PR") - best-effort by design at the call site (a failure here
    must never block linking on title/description alone), but this
    function itself raises on a real API error so the caller can decide
    how to degrade."""
    response = _request("GET", f"{GITHUB_API_BASE}/repos/{full_name}/pulls/{number}/commits?per_page=100", token)
    if response.status_code != 200:
        raise _parse_error(response)
    return [c["commit"]["message"] for c in response.json()]


def create_webhook(token, full_name, callback_url, secret):
    response = _request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{full_name}/hooks",
        token,
        json={
            "name": "web",
            "active": True,
            "events": ["pull_request", "pull_request_review"],
            "config": {
                "url": callback_url,
                "content_type": "json",
                "secret": secret,
                "insecure_ssl": "0",
            },
        },
    )
    if response.status_code not in (200, 201):
        raise _parse_error(response)
    return response.json()


def delete_webhook(token, full_name, hook_id):
    """Best-effort per exigence 9 ("suppression du webhook cote GitHub
    best-effort, avec message d'erreur non bloquant si l'appel API
    echoue") - a 404 (hook already gone, e.g. manually removed on GitHub)
    is treated as success, not an error."""
    response = _request("DELETE", f"{GITHUB_API_BASE}/repos/{full_name}/hooks/{hook_id}", token)
    if response.status_code not in (204, 404):
        raise _parse_error(response)
    return True


def _next_page_url(link_header):
    """Parses a GitHub `Link` pagination header
    (`<url>; rel="next", <url2>; rel="last"`) and returns the `next` URL,
    or None if there isn't one."""
    if not link_header:
        return None
    for part in link_header.split(","):
        segments = part.split(";")
        if len(segments) < 2:
            continue
        url_segment = segments[0].strip()
        rel_segment = segments[1].strip()
        if rel_segment == 'rel="next"' and url_segment.startswith("<") and url_segment.endswith(">"):
            return url_segment[1:-1]
    return None
