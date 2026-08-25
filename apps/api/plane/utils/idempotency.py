# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 4 - "Moteur de synchronisation local-first/
offline pour le web", backend half.

Idempotency-Key support for the three spec-named creation endpoints
(`IssueViewSet.create`, `IssueCommentViewSet.create`,
`PageViewSet.create`/`WorkspacePageViewSet.create`) - a plain pair of
functions called explicitly at the top/bottom of a view's `create()`,
matching this whole initiative's zero-Django-signals, zero-middleware,
explicit-call-site convention. See `plane.db.models.idempotency.
IdempotencyKey`'s own docstring for the model shape and retention
rationale.

Why this exists: the offline sync engine's mutation-queue worker (a
later, frontend-only task) may retry a queued "create issue"/"create
comment"/"create page" request after a reconnect even when the server
already committed the FIRST attempt (the success response was lost to a
flaky connection, the tab crashed mid-flush before recording the
server's id locally, etc.) - without this, that retry would create a
SECOND real row server-side.

Replay semantics, deliberately chosen (see the two functions' own
docstrings for exactly why):
1. No `Idempotency-Key` header -> both functions are complete no-ops.
   Every existing caller of these endpoints (session UI without the
   offline sync engine, `POST` via a personal API token, etc.) is
   unaffected - this is opt-in per request, not a new hard requirement.
2. A first-time key -> proceeds normally, then (only on a 2xx result)
   stores the response for future replays.
3. The SAME key, same request body, replayed while the stored row is
   still fresh -> short-circuits, returning the ORIGINAL response
   verbatim (same status code, same body) without re-executing the
   creation at all.
4. The SAME key, but a DIFFERENT request body (a client bug - reusing a
   key across two unrelated mutations) -> HTTP 409, never silently
   returns the wrong cached row.
5. A 4xx (validation failure) response is never stored - a later retry
   with the same key and a corrected payload must be able to actually
   succeed, not be permanently pinned to the original failure. This is
   the one semantic explicitly required by this feature's own
   verification gate.
6. An expired key (see `IDEMPOTENCY_KEY_TTL_DAYS`) is treated exactly
   like "no key found" AND is eagerly hard-deleted at the moment it's
   found stale, so the same key string can immediately be reused for a
   brand new request without waiting on the row to actually collide with
   the unique `(workspace, key)` constraint below.
"""

import hashlib
import json
import logging
from datetime import timedelta
from typing import Optional

from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.response import Response
from rest_framework import status

from plane.db.models import IdempotencyKey

logger = logging.getLogger("plane.worker")

# See `plane.db.models.idempotency.IdempotencyKey`'s own docstring for the
# reasoning behind this specific value (multi-day, not multi-hour, to
# genuinely cover an offline self-hosted user - VPN outage, air-gapped
# network - without keeping rows around indefinitely).
IDEMPOTENCY_KEY_TTL_DAYS = 7

_HEADER_NAME = "Idempotency-Key"


def _hash_request_payload(data) -> str:
    """Stable hash of a request body, independent of key ordering. `data`
    is normally a plain dict (`request.data` for these three JSON
    endpoints) - `default=str` is a defensive fallback only, in case any
    non-primitive sneaks in (e.g. an `UploadedFile`), so hashing itself
    never raises."""
    canonical = json.dumps(data, sort_keys=True, cls=DjangoJSONEncoder, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def check_idempotency_key(request, *, workspace_id, endpoint: str) -> Optional[Response]:
    """Call at the very top of a `create()` view method, before any
    mutation happens. Returns a `Response` the caller should return
    immediately (short-circuiting the rest of `create()`) if this exact
    request was already successfully processed before; returns `None` if
    the caller should proceed with its normal creation logic (either no
    key was supplied, or this is genuinely the first attempt)."""
    key = request.headers.get(_HEADER_NAME)
    if not key:
        return None

    existing = IdempotencyKey.objects.filter(workspace_id=workspace_id, key=key).first()
    if existing is None:
        return None

    if existing.expires_at <= timezone.now():
        # Stale - purge eagerly (hard delete, not soft) so this same key
        # can be reused for a brand new request right away, see module
        # docstring point 6.
        existing.delete(soft=False)
        return None

    # Defense-in-depth (see `IdempotencyKey`'s own docstring): never serve
    # a cached response to a different user than the one who originally
    # stored it, even though the DB constraint alone is scoped to
    # `(workspace, key)`, not `(workspace, user, key)`.
    if existing.user_id != request.user.id:
        return None

    request_hash = _hash_request_payload(request.data)
    if existing.request_hash != request_hash:
        logger.warning(
            f"Idempotency-Key {key!r} reused with a different payload in workspace {workspace_id}"
        )
        return Response(
            {
                "error": "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
                "error_message": "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
            },
            status=status.HTTP_409_CONFLICT,
        )

    return Response(existing.response_snapshot, status=existing.response_status_code)


def store_idempotent_response(request, *, workspace_id, endpoint: str, response: Response) -> None:
    """Call right before returning from a `create()` view method, with
    the exact `Response` about to be sent back to the client. Only ever
    persists a 2xx response (see module docstring point 5) - a 4xx is
    left entirely unrecorded, so a corrected retry with the same key can
    still succeed normally. No-op if no `Idempotency-Key` header was
    supplied."""
    key = request.headers.get(_HEADER_NAME)
    if not key:
        return

    if not (200 <= response.status_code < 300):
        return

    try:
        IdempotencyKey.objects.create(
            workspace_id=workspace_id,
            user_id=request.user.id,
            key=key,
            endpoint=endpoint,
            request_hash=_hash_request_payload(request.data),
            response_status_code=response.status_code,
            response_snapshot=response.data,
            expires_at=timezone.now() + timedelta(days=IDEMPOTENCY_KEY_TTL_DAYS),
        )
    except IntegrityError:
        # Lost a race with a concurrent request using the same key that
        # stored its own (equally valid, since both attempts succeeded)
        # response first - nothing to do, the row that won is fine to
        # replay from too.
        logger.info(f"Idempotency-Key {key!r} already recorded concurrently in workspace {workspace_id}")
