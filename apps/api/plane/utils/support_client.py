# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Thin Zendesk/Front API clients + inbound payload parsing - see
docs/feature-specs/07-integrations-git.md ("6. Pont support client type
Zendesk/Front") in plane-selfhost.

**Auth choice (Zendesk)**: `WorkspaceSupportConnector.api_token` is used as
an OAuth Bearer access token (`Authorization: Bearer <token>`), not
Zendesk's older Basic `{email}/token:{api_token}` scheme - the connector's
own data model (per the spec) has no separate "agent email" field, and
Zendesk's own docs (developer.zendesk.com, fetched live this session)
state Basic auth is being phased out in favor of OAuth access tokens.
**Known, disclosed gap**: this session could not confirm Zendesk's exact
401 JSON error shape against a real instance (no real Zendesk subdomain
exists in this sandbox - confirmed live: a syntactically-valid but
nonexistent subdomain returns Zendesk's own "no help desk configured"
page, not an auth error, since the request never reaches account-level
auth checking) - `_raise_for_zendesk_error` below defensively tries
several plausible key names (`error`, `description`, `message`) with a
raw-text fallback rather than assuming one exact shape.

**Front** was verified for real: `https://api2.frontapp.com/me` with an
invalid bearer token returns HTTP 401
`{"_error": {"status": 401, "title": "Unauthenticated", "message":
"Invalid token"}}` - `_raise_for_front_error` parses this exact shape.
Real endpoint paths (`PATCH /conversations/{id}`, `POST
/conversations/{id}/comments`) confirmed via dev.frontapp.com's own API
reference, fetched live.

**Front public replies are out of scope**: Front's "Add Comment" endpoint
used here always creates an *internal* note - a real customer-visible
reply needs Front's separate "Reply" (`/conversations/{id}/messages`)
endpoint, which additionally requires a configured outbound channel/author
identity this connector's minimal data model doesn't carry. So for the
`front` provider, `reopen_note_visibility="public"` currently degrades to
an internal note - documented here and in the connector's own README as a
known V1 gap, not silently pretended to work.
"""

import re

import requests

# Exigence 4(a) - "collage d'une URL de ticket reconnue par une regex
# propre au provider configuré, avec extraction automatique de l'ID".
# Zendesk: matches both the modern agent UI path (`/agent/tickets/{id}`)
# and the older bare `/tickets/{id}` path, on any `*.zendesk.com`
# subdomain. Front: Front's own web app links to a conversation via
# `https://app.frontapp.com/open/<id>` (a short id, not a URL-friendly
# `cnv_...` API id - the same open/<id> path Front's own UI copy-link
# button produces). generic_webhook has no fixed URL shape to defer to
# (no third-party doc exists for an arbitrary "generic" tool) so it isn't
# in this table - exigence 4's "toute autre forme d'URL est rejetee" is
# enforced by the caller treating a missing/unrecognized provider as a
# rejection, which is exactly what happens for generic_webhook here.
_TICKET_URL_PATTERNS = {
    "zendesk": re.compile(r"^https://[a-zA-Z0-9-]+\.zendesk\.com/(?:agent/)?tickets/(\d+)/?$"),
    "front": re.compile(r"^https://app\.frontapp\.com/open/([a-zA-Z0-9_-]+)/?$"),
}


def extract_ticket_id_from_url(provider, url):
    """Returns the extracted ticket/conversation id, or None if `url`
    doesn't match this provider's known URL shape (exigence 4 - "toute
    autre forme d'URL est rejetée avec un message d'erreur explicite")."""
    pattern = _TICKET_URL_PATTERNS.get(provider)
    if pattern is None or not url:
        return None
    match = pattern.match(url.strip())
    return match.group(1) if match else None


_GENERIC_DEFAULT_FIELD_MAPPING = {
    "ticket_id": "ticket_id",
    "url": "url",
    "requester_email": "requester_email",
    "requester_name": "requester_name",
    "subject": "subject",
    "status": "status",
    "priority": "priority",
    "tags": "tags",
    "last_message": "last_message",
}


class SupportAPIError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _get_by_dotted_path(payload, dotted_path):
    value = payload
    for part in (dotted_path or "").split("."):
        if not part:
            continue
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return None
    return value


# --------------------------------------------------------------------------
# Zendesk
# --------------------------------------------------------------------------


def _zendesk_headers(api_token):
    return {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}


def _raise_for_zendesk_error(response):
    if response.ok:
        return
    detail = None
    try:
        body = response.json()
        if isinstance(body, dict):
            detail = body.get("error") or body.get("description") or body.get("message")
            if isinstance(detail, dict):
                detail = detail.get("title") or detail.get("message") or str(detail)
    except ValueError:
        pass
    detail = detail or response.text or f"HTTP {response.status_code}"
    raise SupportAPIError(detail, status_code=response.status_code)


def zendesk_validate_token(domain, api_token, timeout=10):
    """`GET /api/v2/users/me.json` - the standard "who am I" endpoint used
    to validate credentials without needing to know a ticket id."""
    url = f"https://{domain}.zendesk.com/api/v2/users/me.json"
    try:
        response = requests.get(url, headers=_zendesk_headers(api_token), timeout=timeout)
    except requests.RequestException as e:
        raise SupportAPIError(str(e)) from e
    _raise_for_zendesk_error(response)
    return response.json()


def zendesk_get_ticket(domain, api_token, ticket_id, timeout=10):
    url = f"https://{domain}.zendesk.com/api/v2/tickets/{ticket_id}.json"
    try:
        response = requests.get(url, headers=_zendesk_headers(api_token), timeout=timeout)
    except requests.RequestException as e:
        raise SupportAPIError(str(e)) from e
    _raise_for_zendesk_error(response)
    return response.json().get("ticket", {})


def zendesk_update_ticket(
    domain, api_token, ticket_id, status=None, comment_body=None, comment_public=False, timeout=10
):
    """`PUT /api/v2/tickets/{id}.json` - a status change and a comment can
    be sent in the same call, which is how Zendesk's API expects both a
    reopen and its accompanying note to be applied atomically."""
    ticket_payload = {}
    if status is not None:
        ticket_payload["status"] = status
    if comment_body is not None:
        ticket_payload["comment"] = {"body": comment_body, "public": bool(comment_public)}

    url = f"https://{domain}.zendesk.com/api/v2/tickets/{ticket_id}.json"
    try:
        response = requests.put(
            url, headers=_zendesk_headers(api_token), json={"ticket": ticket_payload}, timeout=timeout
        )
    except requests.RequestException as e:
        raise SupportAPIError(str(e)) from e
    _raise_for_zendesk_error(response)
    return response.json().get("ticket", {})


# --------------------------------------------------------------------------
# Front
# --------------------------------------------------------------------------

FRONT_API_BASE = "https://api2.frontapp.com"


def _front_headers(api_token):
    return {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}


def _raise_for_front_error(response):
    if response.ok:
        return
    detail = None
    try:
        body = response.json()
        if isinstance(body, dict):
            error = body.get("_error") or {}
            detail = error.get("message") or error.get("title")
    except ValueError:
        pass
    detail = detail or response.text or f"HTTP {response.status_code}"
    raise SupportAPIError(detail, status_code=response.status_code)


def front_validate_token(api_token, timeout=10):
    try:
        response = requests.get(f"{FRONT_API_BASE}/me", headers=_front_headers(api_token), timeout=timeout)
    except requests.RequestException as e:
        raise SupportAPIError(str(e)) from e
    _raise_for_front_error(response)
    return response.json()


def front_get_conversation(api_token, conversation_id, timeout=10):
    try:
        response = requests.get(
            f"{FRONT_API_BASE}/conversations/{conversation_id}", headers=_front_headers(api_token), timeout=timeout
        )
    except requests.RequestException as e:
        raise SupportAPIError(str(e)) from e
    _raise_for_front_error(response)
    return response.json()


def front_update_conversation_status(api_token, conversation_id, status, timeout=10):
    """`status` must be one of Front's own real values: archived/open/deleted/spam."""
    try:
        response = requests.patch(
            f"{FRONT_API_BASE}/conversations/{conversation_id}",
            headers=_front_headers(api_token),
            json={"status": status},
            timeout=timeout,
        )
    except requests.RequestException as e:
        raise SupportAPIError(str(e)) from e
    _raise_for_front_error(response)
    return {} if response.status_code == 204 else response.json()


def front_add_comment(api_token, conversation_id, body, timeout=10):
    """Always an internal note - see module docstring's "Front public
    replies are out of scope" section."""
    try:
        response = requests.post(
            f"{FRONT_API_BASE}/conversations/{conversation_id}/comments",
            headers=_front_headers(api_token),
            json={"body": body},
            timeout=timeout,
        )
    except requests.RequestException as e:
        raise SupportAPIError(str(e)) from e
    _raise_for_front_error(response)
    return response.json()


# --------------------------------------------------------------------------
# Provider-dispatching helpers used by the outbound-sync task
# --------------------------------------------------------------------------


def reopen_ticket_and_note(connector, ticket, note_body):
    """
    Exigence 9/10/11 - reopens `ticket` at the provider (idempotent/
    defensive: only calls the status-changing endpoint when the ticket
    isn't already open, per the ticket's own last known
    `last_synced_status`) and always posts `note_body` (exigence 11/12 -
    the note is posted even when `reopen_ticket_on_resolve` is disabled or
    the ticket is already open). Raises `SupportAPIError` on any provider
    failure - the caller is responsible for catching it, marking
    `sync_state=ERROR`, and scheduling a retry.

    Returns True (regardless of whether a status change was actually
    sent) on success.
    """
    api_token = connector.api_token
    provider = connector.provider

    if provider == "zendesk":
        already_open = (ticket.last_synced_status or "").lower() in ("new", "open")
        if connector.reopen_ticket_on_resolve and not already_open:
            zendesk_update_ticket(
                connector.domain,
                api_token,
                ticket.external_ticket_id,
                status="open",
                comment_body=note_body,
                comment_public=(connector.reopen_note_visibility == "public"),
            )
        else:
            # Status unchanged - still post the note as its own comment.
            zendesk_update_ticket(
                connector.domain,
                api_token,
                ticket.external_ticket_id,
                status=None,
                comment_body=note_body,
                comment_public=(connector.reopen_note_visibility == "public"),
            )
        return True

    if provider == "front":
        already_open = (ticket.last_synced_status or "").lower() == "open"
        if connector.reopen_ticket_on_resolve and not already_open:
            front_update_conversation_status(api_token, ticket.external_ticket_id, "open")
        front_add_comment(api_token, ticket.external_ticket_id, note_body)
        return True

    if provider == "generic_webhook":
        # No documented outbound API shape exists for an arbitrary
        # generic_webhook provider (exigence 2 only asks for an inbound
        # JSON mapping) - nothing to call. Treated as a no-op success
        # (not an error) so `sync_state` doesn't flap to ERROR for a
        # provider that was never promised outbound sync in the first
        # place; see docker/api/support-connectors/README.md.
        return True

    raise SupportAPIError(f"Unknown provider '{provider}'")


def extract_ticket_fields_from_payload(connector, payload):
    """
    Normalizes an inbound webhook payload into the fields
    `IssueSupportTicket` cares about, dispatched by `connector.provider`.

    - `front`: parses Front's real, fixed event-object shape
      (`type`, `conversation.{id,subject,status,recipient,tags}` -
      verified against dev.frontapp.com's own Events reference).
    - `zendesk`/`generic_webhook`: Zendesk webhooks are configured by the
      workspace admin as a Trigger's own free-form JSON body template
      (Zendesk does not have one fixed "the" ticket-webhook schema - it is
      whatever JSON the admin's Trigger action sends), so both providers
      share the same minimal-key-mapping contract the spec's own
      `generic_webhook` requirement describes: `connector.generic_field_mapping`
      supplies a `{logical_field: "dotted.path"}` override per key,
      defaulting to a flat top-level key of the same name
      (`_GENERIC_DEFAULT_FIELD_MAPPING`) when unset.

    Returns a dict with keys: ticket_id, url, requester_email,
    requester_name, subject, status, priority, tags (list), last_message.
    Any field that can't be found is None (or [] for tags) - callers must
    treat a missing `ticket_id` as "cannot process this payload".
    """
    if connector.provider == "front":
        conversation = payload.get("conversation") or {}
        recipient = conversation.get("recipient") or {}
        tags = [t.get("name") for t in (conversation.get("tags") or []) if isinstance(t, dict) and t.get("name")]
        return {
            "ticket_id": conversation.get("id"),
            "url": (conversation.get("_links") or {}).get("self") or "",
            "requester_email": recipient.get("handle"),
            "requester_name": recipient.get("name") or recipient.get("handle"),
            "subject": conversation.get("subject") or "",
            "status": conversation.get("status"),
            "priority": None,
            "tags": tags,
            # Front's event payload doesn't carry a message body without a
            # follow-up API call (see README) - left blank rather than
            # guessed.
            "last_message": None,
        }

    mapping = connector.generic_field_mapping or _GENERIC_DEFAULT_FIELD_MAPPING
    resolved = {}
    for field, default_path in _GENERIC_DEFAULT_FIELD_MAPPING.items():
        path = mapping.get(field, default_path)
        resolved[field] = _get_by_dotted_path(payload, path)
    if resolved.get("tags") is None:
        resolved["tags"] = []
    elif not isinstance(resolved["tags"], list):
        resolved["tags"] = [str(resolved["tags"])]
    return resolved
