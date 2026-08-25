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

Category 12, feature 4 data-integrity review fix (confirmed TOCTOU,
finding severity: high/"critical fallback undermined"): the previous
implementation was a plain check-then-act - `check_idempotency_key` did
an unlocked `SELECT`, returned `None` if nothing matched, and the CALLER
then executed the real mutation (`serializer.save()`, several `.delay()`
enqueues, a re-query for the response) before finally calling
`store_idempotent_response` at the very end. Two concurrent requests
bearing the SAME key could both pass the initial `SELECT` before either
had stored anything, both proceed to create a real row, and only the
LATER `IdempotencyKey` bookkeeping insert would collide - caught by a
bare `except IntegrityError: pass`, silently swallowing the fact that a
genuine double-creation (and a double-fire of every associated
webhook/Slack/AI-triage side effect) had just happened. This is exactly
the race the frontend's own multi-tab coordination (`packages/
sync-engine/src/locks.ts`) documents relying on this module to prevent
on any browser without `navigator.locks`.

Fixed by turning this into an atomic RESERVATION instead of a read-then-
write: `check_idempotency_key` now attempts to `INSERT` a placeholder
row (`response_status_code=0`, a sentinel that is never a real HTTP
status - see `_RESERVATION_SENTINEL_STATUS`) FIRST, before the caller is
allowed to run any mutation logic at all. The `(workspace, key)` unique
constraint itself is the serialization point: only ONE concurrent
request can ever win that `INSERT` for a given key - Postgres either
raises `IntegrityError` immediately (if the winner's `INSERT` already
committed, which it does as its own standalone auto-committed statement,
this codebase does not use `ATOMIC_REQUESTS`) or the loser's own insert
attempt is row-locked and blocks until the winner's transaction resolves
(if the winner hasn't committed yet), after which the loser observes
either the winner's real (committed) row or its absence (if the winner's
whole request failed/rolled back) - never a window where both callers
can proceed unprotected. A request that loses the race and finds the
reservation still `in progress` polls briefly in-process for the common
case (the winner typically finishes within the same request's lifetime),
and only falls back to telling the client to back off
(`IDEMPOTENCY_KEY_IN_PROGRESS`, 409) if the winner is still working after
that. `store_idempotent_response` now only ever UPDATEs (on success) or
DELETEs (on failure, so a corrected retry can claim the key fresh again -
preserves semantic 5 above) the SAME row `check_idempotency_key`
reserved - it never independently attempts its own `INSERT` anymore, so
there is no second place left for a lost race to be silently swallowed.
"""

import hashlib
import json
import logging
import time
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

# Not a real HTTP status code (the lowest real one is 100) - marks a
# freshly-`INSERT`ed row as "reserved, mutation still in progress" until
# `store_idempotent_response` overwrites it with the real outcome. See
# module docstring for the full reservation design this sentinel enables.
_RESERVATION_SENTINEL_STATUS = 0

# How many times (and how long between each) `check_idempotency_key`
# polls in-process for a concurrent winner's reservation to resolve
# before giving up and returning `IDEMPOTENCY_KEY_IN_PROGRESS`. Small and
# bounded on purpose - this is a belt-and-braces improvement for the
# common "the winner finishes within our own request's lifetime" case,
# not a substitute for the client's own retry/backoff (`packages/
# sync-engine/src/queue.ts`'s `computeBackoffMs`), which is what actually
# guarantees eventual delivery.
_RESERVATION_POLL_ATTEMPTS = 5
_RESERVATION_POLL_INTERVAL_SECONDS = 0.05


def _hash_request_payload(data) -> str:
    """Stable hash of a request body, independent of key ordering. `data`
    is normally a plain dict (`request.data` for these three JSON
    endpoints) - `default=str` is a defensive fallback only, in case any
    non-primitive sneaks in (e.g. an `UploadedFile`), so hashing itself
    never raises."""
    canonical = json.dumps(data, sort_keys=True, cls=DjangoJSONEncoder, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _in_progress_response() -> Response:
    return Response(
        {
            "error": "IDEMPOTENCY_KEY_IN_PROGRESS",
            "error_message": "IDEMPOTENCY_KEY_IN_PROGRESS",
        },
        status=status.HTTP_409_CONFLICT,
    )


def _reused_with_different_payload_response(key: str, workspace_id) -> Response:
    logger.warning(f"Idempotency-Key {key!r} reused with a different payload in workspace {workspace_id}")
    return Response(
        {
            "error": "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
            "error_message": "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
        },
        status=status.HTTP_409_CONFLICT,
    )


def check_idempotency_key(request, *, workspace_id, endpoint: str) -> Optional[Response]:
    """Call at the very top of a `create()` view method, before any
    mutation happens. Returns a `Response` the caller should return
    immediately (short-circuiting the rest of `create()`) if this exact
    request was already successfully processed before (or is currently
    being processed by a concurrent request, or reused the same key with
    a different payload); returns `None` if the caller should proceed
    with its normal creation logic - either no key was supplied, or this
    request has just atomically RESERVED this key and must call
    `store_idempotent_response` (with the real outcome) before returning,
    see module docstring for the full reservation design."""
    key = request.headers.get(_HEADER_NAME)
    if not key:
        return None

    request_hash = _hash_request_payload(request.data)
    # `None` means "as far as we know, no row for this key exists yet" -
    # only ever attempt the `INSERT` reservation below while this is
    # `None`. Once we've observed a row (sentinel or real), every further
    # iteration is a plain re-`SELECT` (a cheap poll), never another
    # doomed `INSERT` attempt against a key we already know is taken.
    existing: Optional[IdempotencyKey] = IdempotencyKey.objects.filter(workspace_id=workspace_id, key=key).first()

    for attempt in range(_RESERVATION_POLL_ATTEMPTS + 1):
        if existing is None:
            try:
                IdempotencyKey.objects.create(
                    workspace_id=workspace_id,
                    user_id=request.user.id,
                    key=key,
                    endpoint=endpoint,
                    request_hash=request_hash,
                    response_status_code=_RESERVATION_SENTINEL_STATUS,
                    response_snapshot={},
                    expires_at=timezone.now() + timedelta(days=IDEMPOTENCY_KEY_TTL_DAYS),
                )
                # Won the race - this request now exclusively holds the
                # key. Stash the fact on `request` (not the return value,
                # to keep this function's "None = proceed" contract
                # simple for callers) so `store_idempotent_response`
                # knows to finalize (UPDATE/DELETE) THIS row rather than
                # attempting its own, separate `INSERT`.
                request._idempotency_reservation_key = key
                return None
            except IntegrityError:
                # Lost the race - re-`SELECT` to see what's there now
                # (the winner's row, almost always) and fall through to
                # the checks below on THIS same iteration rather than
                # burning a poll interval just to re-discover it.
                existing = IdempotencyKey.objects.filter(workspace_id=workspace_id, key=key).first()
                if existing is None:
                    # The row that caused our IntegrityError is already
                    # gone again (the other request's attempt ultimately
                    # failed and was cleaned up, or an expired row was
                    # purged) - immediately retry claiming it ourselves.
                    continue

        if existing.expires_at <= timezone.now():
            existing.delete(soft=False)
            existing = None
            continue

        # Defense-in-depth (see `IdempotencyKey`'s own docstring): never
        # serve a cached response to, or block a reservation attempt by,
        # a different user than the one who originally stored it, even
        # though the DB constraint alone is scoped to `(workspace, key)`,
        # not `(workspace, user, key)`. We deliberately do NOT attach a
        # reservation here - this request proceeds completely
        # unprotected (matching the pre-fix "skip" semantics for this
        # edge case) rather than either blocking a legitimate different
        # user on someone else's key collision or racing them for it.
        if existing.user_id != request.user.id:
            return None

        if existing.request_hash != request_hash:
            return _reused_with_different_payload_response(key, workspace_id)

        if existing.response_status_code == _RESERVATION_SENTINEL_STATUS:
            # Still being processed by whichever request won the
            # reservation above - by construction, WE cannot also be
            # executing the mutation right now (the double-creation this
            # whole module exists to prevent cannot happen from this
            # branch). Poll briefly for the common case where the winner
            # finishes within our own request's lifetime...
            if attempt < _RESERVATION_POLL_ATTEMPTS:
                time.sleep(_RESERVATION_POLL_INTERVAL_SECONDS)
                existing = IdempotencyKey.objects.filter(workspace_id=workspace_id, key=key).first()
                continue
            # ...otherwise tell the client to back off and retry - it
            # must NOT proceed with its own mutation.
            return _in_progress_response()

        return Response(existing.response_snapshot, status=existing.response_status_code)

    # Unreachable in practice - every branch above either returns or
    # `continue`s into one that eventually does, and the loop bound
    # (`_RESERVATION_POLL_ATTEMPTS + 1`) is only ever exhausted by the
    # "still in progress" branch, which itself returns on its last
    # iteration. Defensive fallback only.
    return _in_progress_response()


def store_idempotent_response(request, *, workspace_id, endpoint: str, response: Response) -> None:
    """Call right before returning from a `create()` view method, with
    the exact `Response` about to be sent back to the client. No-op if no
    `Idempotency-Key` header was supplied, or if this exact request
    didn't win the reservation in `check_idempotency_key` (the "different
    user reused this key" edge case - see that function's own
    docstring). Only ever persists a 2xx response (see module docstring
    point 5) - a 4xx/5xx instead DELETES the reservation entirely, so a
    corrected retry with the same key can claim it fresh rather than
    being permanently pinned at "in progress"."""
    key = getattr(request, "_idempotency_reservation_key", None)
    if not key:
        return

    if 200 <= response.status_code < 300:
        IdempotencyKey.objects.filter(workspace_id=workspace_id, key=key, user_id=request.user.id).update(
            endpoint=endpoint,
            response_status_code=response.status_code,
            response_snapshot=response.data,
            expires_at=timezone.now() + timedelta(days=IDEMPOTENCY_KEY_TTL_DAYS),
        )
    else:
        IdempotencyKey.objects.filter(workspace_id=workspace_id, key=key, user_id=request.user.id).delete(
            soft=False
        )
