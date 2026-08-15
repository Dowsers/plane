# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Thin GitLab REST API v4 client for the GitLab native MR<->issue linking
feature - see docs/feature-specs/07-integrations-git.md ("2. GitLab
natif") in plane-selfhost, exigence 17: "Les appels sortants vers l'API
GitLab respectent un backoff/retry en cas de code 429 ou 5xx, avec un
plafond de tentatives configurable" (`settings.GIT_INTEGRATION_API_MAX_RETRIES`,
shared with plane/utils/github_client.py - same synchronous-inline-call
reasoning as that module's docstring).

`instance_url` is always an explicit parameter (never a module-level
constant) since exigence 1 requires supporting both `gitlab.com` and a
self-hosted instance with an arbitrary URL per workspace.
"""

import time

import requests

from django.conf import settings

_RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
_REQUEST_TIMEOUT_SECONDS = 15


class GitlabAPIError(Exception):
    def __init__(self, status_code, message, payload=None):
        self.status_code = status_code
        self.message = message
        self.payload = payload or {}
        super().__init__(f"GitLab API error {status_code}: {message}")


def _api_base(instance_url):
    return instance_url.rstrip("/") + "/api/v4"


def _headers(token):
    return {"PRIVATE-TOKEN": token, "User-Agent": "Plane-GitLab-Integration"}


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
                raise GitlabAPIError(0, str(e)) from e
            time.sleep(min(2**attempt, 8))
            continue

        if response.status_code in _RETRYABLE_STATUSES and attempt < max_retries:
            last_response = response
            time.sleep(min(2**attempt, 8))
            continue

        return response
    return last_response


def _parse_error(response):
    try:
        payload = response.json()
        message = payload.get("message", response.text)
    except ValueError:
        payload = {}
        message = response.text
    return GitlabAPIError(response.status_code, message, payload)


def get_authenticated_user(instance_url, token):
    """`GET /user` - used at connect-time to populate
    `GitlabWorkspaceConnection.gitlab_username` and to validate the
    token/instance_url pair up front. Raises `GitlabAPIError` on a bad
    token - confirmed against the real gitlab.com API with an invalid
    token during this feature's own testing (see the README): GitLab
    returns `{"message": "401 Unauthorized"}`, which `_parse_error`
    surfaces verbatim."""
    response = _request("GET", f"{_api_base(instance_url)}/user", token)
    if response.status_code != 200:
        raise _parse_error(response)
    return response.json()


def list_projects(instance_url, token):
    """Returns a flat list of project dicts accessible to `token`, across
    every page - GitLab paginates via `X-Next-Page` (not a `Link` header
    like GitHub, per this spec's own "Considerations API/UX" note), capped
    at 10 pages for the same reason as the GitHub client."""
    projects = []
    page = 1
    for _ in range(10):
        response = _request(
            "GET",
            f"{_api_base(instance_url)}/projects?membership=true&per_page=100&page={page}",
            token,
        )
        if response.status_code != 200:
            raise _parse_error(response)
        projects.extend(response.json())
        next_page = response.headers.get("X-Next-Page")
        if not next_page:
            break
        page = int(next_page)
    return [
        {
            "gitlab_project_id": p["id"],
            "path_with_namespace": p["path_with_namespace"],
            "web_url": p["web_url"],
            "default_branch": p.get("default_branch"),
        }
        for p in projects
    ]


def get_merge_request(instance_url, token, project_id, merge_iid):
    response = _request(
        "GET", f"{_api_base(instance_url)}/projects/{project_id}/merge_requests/{merge_iid}", token
    )
    if response.status_code != 200:
        raise _parse_error(response)
    return response.json()


def list_merge_request_commit_messages(instance_url, token, project_id, merge_iid):
    response = _request(
        "GET",
        f"{_api_base(instance_url)}/projects/{project_id}/merge_requests/{merge_iid}/commits?per_page=100",
        token,
    )
    if response.status_code != 200:
        raise _parse_error(response)
    return [c["message"] for c in response.json()]


def create_webhook(instance_url, token, project_id, callback_url, secret_token):
    response = _request(
        "POST",
        f"{_api_base(instance_url)}/projects/{project_id}/hooks",
        token,
        json={
            "url": callback_url,
            "merge_requests_events": True,
            "token": secret_token,
            "enable_ssl_verification": True,
        },
    )
    if response.status_code not in (200, 201):
        raise _parse_error(response)
    return response.json()


def delete_webhook(instance_url, token, project_id, hook_id):
    """Best-effort, matching GitHub client's own delete_webhook - a 404
    (already removed) counts as success."""
    response = _request(
        "DELETE", f"{_api_base(instance_url)}/projects/{project_id}/hooks/{hook_id}", token
    )
    if response.status_code not in (204, 404):
        raise _parse_error(response)
    return True
