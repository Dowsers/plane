# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 4 - "Moteur de synchronisation local-first/
offline pour le web", backend half.

`IdempotencyKey` backs the replay-safety half of the offline sync engine:
when the client's mutation-queue worker (built by a later, frontend-only
task) flushes a queued creation after a reconnect, it may legitimately
retry the exact same creation request more than once (a response lost to
a flaky connection right after the server actually committed it, a tab
crash/restart mid-flush, etc.) - without this, a retried "create issue"
would create a SECOND issue server-side, which is exactly the "double
creation" this model exists to prevent. See `plane.utils.idempotency` for
the actual read/write helper functions called from view `create()`
methods (a plain function called at the top of the method, NOT
middleware, NOT a signal - matches this whole initiative's zero-signals,
explicit-call-site convention).

Design notes (see `plane.utils.idempotency` module docstring for the full
replay-semantics writeup):
- Uniqueness is `(workspace, key)`, exactly as this feature's own spec
  models it - NOT `(workspace, user, key)`. `user` is still a real FK on
  this model (used for a defense-in-depth check on the READ side: a
  lookup only ever returns a cached response to the SAME user who
  originally stored it, even though the DB constraint alone would allow
  two different users' client-generated keys to collide within one
  workspace). A genuine collision is not a realistic concern in practice
  (`key` is a client-generated UUID), but costs nothing to guard anyway.
- Only successful (2xx) creations are ever stored here - see
  `plane.utils.idempotency.store_idempotent_response`'s own docstring for
  why a 4xx must NOT be cached (a corrected retry with the same key must
  be able to actually succeed, not be pinned to the original failure
  forever).
- `expires_at` (7 days from creation, see `IDEMPOTENCY_KEY_TTL_DAYS` in
  `plane.utils.idempotency`) balances replay-safety for a genuinely
  offline self-hosted user (VPN/air-gapped network, per this feature's
  own motivation) against unbounded storage growth - a queued mutation
  that's still unflushed after a week is already an extreme edge case the
  frontend's own `beforeunload` warning (exigence 14) and "Syncing (n)"
  indicator (exigence 5) are designed to surface to the user well before
  that point. Purged daily by
  `plane.bgtasks.cleanup_task.purge_expired_idempotency_keys`, and also
  purged eagerly, inline, the moment an expired row is found not to match
  on a lookup (see `plane.utils.idempotency.check_idempotency_key`) - the
  eager purge exists so a legitimately-expired key can always be reused
  for a brand new request without waiting for the next daily sweep to
  clear the old row out of the way of the unique constraint.
"""

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models

from .base import BaseModel


class IdempotencyKey(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="idempotency_keys"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="idempotency_keys"
    )
    # Client-supplied value of the `Idempotency-Key` request header.
    # Deliberately a free-form `CharField`, not a `UUIDField` - the spec's
    # own model calls it a client-supplied UUID, but nothing on the read
    # path actually requires UUID formatting, and rejecting a
    # non-UUID-shaped-but-otherwise-fine key would be a needless way for
    # this feature to fail closed on an otherwise-harmless client detail.
    key = models.CharField(max_length=255, db_index=True)
    # Which creation endpoint this key was recorded against - free-form
    # label set by the caller (e.g. "issue.create"), for
    # debugging/observability only, never used to decide a match (the
    # match is purely `(workspace, key)`).
    endpoint = models.CharField(max_length=255)
    # sha256 hex digest of the canonicalized request body - lets a lookup
    # detect a client reusing the same key for a genuinely different
    # payload (a client bug) and refuse to serve the wrong cached
    # response instead of silently doing so. See
    # `plane.utils.idempotency.check_idempotency_key`.
    request_hash = models.CharField(max_length=64)
    response_status_code = models.PositiveSmallIntegerField()
    # `encoder=DjangoJSONEncoder` so the exact same response body types
    # this feature's own view `create()` methods already return today
    # (UUID/datetime objects mixed into a plain dict, not always run
    # through a serializer's `to_representation()` first - see
    # `IssueViewSet.create`) round-trip safely through Postgres' `jsonb`
    # without a pre-serialization pass at every call site.
    response_snapshot = models.JSONField(default=dict, encoder=DjangoJSONEncoder)
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        verbose_name = "Idempotency Key"
        verbose_name_plural = "Idempotency Keys"
        db_table = "idempotency_keys"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "key"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_idempotency_key_per_workspace_when_active",
            )
        ]

    def __str__(self):
        return f"{self.key} <{self.workspace_id}>"
