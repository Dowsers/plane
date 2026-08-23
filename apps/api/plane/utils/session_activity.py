# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 6 ("Politiques de securite configurables"),
exigence 7 - per-workspace idle-session timeout.

## The problem

`WorkspaceSecurityPolicy.session_timeout_minutes` is a PER-WORKSPACE
setting, but Plane's actual session mechanism
(`plane.authentication.utils.login.user_login`, `django.contrib.auth.login`)
issues ONE Django session cookie per browser/app-context - not one per
workspace (confirmed by this initiative's own prior research). A single
user can belong to several workspaces at once, each with its own
(possibly different, possibly null) `session_timeout_minutes`, while their
browser only ever holds one session cookie for the whole app.
`django.conf.settings.SESSION_COOKIE_AGE` is a single global value - there
is no way to express "expire this cookie after N minutes for workspace A
but M minutes for workspace B" through Django's own session-cookie
mechanism, because the cookie itself has no concept of "which workspace am
I currently being used for".

## The design actually built here

Rather than trying to bend the one shared session cookie into
per-workspace semantics (which would require either literally invalidating
the browser's ONE session - collateral-damaging every other workspace tab
open in the same browser - or a much larger architecture change to
per-workspace tokens, out of scope for this feature), this tracks IDLE
TIME per (user, workspace) pair, entirely independently of the underlying
Django session:

- `WorkspaceMember.last_workspace_activity_at` (one row already exists per
  (workspace, member) pair - no new model) is bumped on every authenticated
  request whose URL is scoped to a specific workspace
  (`/api/workspaces/<slug>/...`).
- `enforce_workspace_session_timeout()` below is called from
  `plane.app.views.base.TimezoneMixin.initial()` - the one `initial()`
  override both `BaseViewSet` and `BaseAPIView` already route every
  request through, so every workspace-scoped app/ endpoint is covered by
  construction, the same "single choke point" pattern this category has
  already used repeatedly (see `user_login()`'s own docstring).
- The EFFECTIVE timeout for a given workspace is: that workspace's own
  `WorkspaceSecurityPolicy.session_timeout_minutes` if set, capped at the
  instance-wide `INSTANCE_MAX_SESSION_TIMEOUT_MINUTES` ceiling (an Owner
  cannot set a longer idle timeout than the instance allows, exigence 7's
  own wording) - i.e. `min(workspace_value, instance_ceiling)` when a
  workspace value is set, or exactly `instance_ceiling` when it is not.
- If the elapsed idle time since `last_workspace_activity_at` exceeds the
  effective timeout, the request is rejected - but ONLY for requests
  scoped to THAT workspace. The underlying Django session cookie is left
  completely untouched: the same browser can keep using a different,
  still-fresh workspace in another tab without interruption, and even
  within the timed-out workspace, the very next request (e.g. once the
  frontend has taken the user through a fresh login/re-auth flow for that
  workspace) works again immediately, since nothing about the actual
  session was destroyed.

## Explicit limits of this design (read before assuming this is a full
   session-invalidation mechanism)

1. This does NOT log the user out of Plane globally and does NOT expire
   the underlying Django session cookie - a browser that already holds the
   session cookie could still authenticate to a DIFFERENT, non-timed-out
   workspace with it. This is a deliberate, documented trade-off: a real
   fix would require per-workspace session/token issuance, a materially
   larger architecture change than this feature's scope.
2. Enforcement is request-driven, not proactive: a browser tab left open
   with no further API calls is not proactively logged out the instant the
   timeout elapses - the check only runs when a new request actually
   arrives for that workspace.
3. `last_workspace_activity_at` is written via a plain `.update()`
   (bypassing `BaseModel.save()`, so no `updated_by` mutation and no extra
   `SELECT`) on effectively every workspace-scoped request - a real,
   bounded per-request cost (one indexed `UPDATE`), accepted deliberately
   over a Redis-cache-based alternative: a security idle-timer that fails
   OPEN silently on a cache eviction/restart (the timer would just quietly
   reset) is a worse trade-off for a security feature than one small extra
   query per request.
4. A workspace with no `WorkspaceSecurityPolicy` row yet (the common case,
   since the row is created lazily) is NOT exempt from this - it still
   gets the instance ceiling as its effective timeout. Given this fork's
   own `SESSION_COOKIE_AGE` default (604800s = 7 days,
   `plane/settings/common.py`), the shipped instance-config default below
   is deliberately set to the same 7 days so a freshly-deployed instance
   that never touches either setting sees no practical behavior change
   from this feature.
"""

import logging
from datetime import timedelta
from typing import Optional

from django.utils import timezone

from plane.license.utils.instance_value import get_configuration_value

logger = logging.getLogger("plane.utils.session_activity")

# Matches this fork's own SESSION_COOKIE_AGE default (604800 seconds = 7
# days, plane/settings/common.py) - see limit #4 above.
DEFAULT_INSTANCE_MAX_SESSION_TIMEOUT_MINUTES = 10080


def get_instance_max_session_timeout_minutes() -> int:
    (value,) = get_configuration_value(
        [
            {
                "key": "INSTANCE_MAX_SESSION_TIMEOUT_MINUTES",
                "default": str(DEFAULT_INSTANCE_MAX_SESSION_TIMEOUT_MINUTES),
            }
        ]
    )
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return DEFAULT_INSTANCE_MAX_SESSION_TIMEOUT_MINUTES


def resolve_effective_session_timeout_minutes(policy) -> int:
    """`policy` is a `WorkspaceSecurityPolicy` instance or `None` (no row
    yet - the instance ceiling applies on its own, see limit #4 above)."""
    ceiling = get_instance_max_session_timeout_minutes()
    if policy is not None and policy.session_timeout_minutes:
        return min(policy.session_timeout_minutes, ceiling)
    return ceiling


def enforce_workspace_session_timeout(request, workspace_slug: str) -> Optional[str]:
    """Call once per authenticated, workspace-scoped request. Returns
    `None` if the request may proceed (and bumps
    `last_workspace_activity_at` to now as a side effect), or a
    human-readable error string if the workspace's idle timeout has been
    exceeded - the caller is responsible for turning that into an HTTP
    error response; this function never raises/returns a `Response`
    itself, to keep it reusable from both DRF views and any future
    non-DRF call site.
    """
    # Local import to avoid a circular import - this module is imported
    # from plane.app.views.base, which sits underneath plane.db.models in
    # some import chains during test collection.
    from plane.db.models import WorkspaceMember

    member = (
        WorkspaceMember.objects.filter(
            workspace__slug=workspace_slug, member_id=request.user.id, is_active=True
        )
        .select_related("workspace", "workspace__security_policy")
        .first()
    )
    if member is None:
        # Not an active member of this workspace at all - not this
        # function's concern, the view's own permission check (if any) is
        # what handles access control.
        return None

    policy = getattr(member.workspace, "security_policy", None)
    effective_minutes = resolve_effective_session_timeout_minutes(policy)
    now = timezone.now()

    if member.last_workspace_activity_at is not None:
        idle_for = now - member.last_workspace_activity_at
        if idle_for > timedelta(minutes=effective_minutes):
            logger.info(
                "Workspace session timeout: user %s idle for %s in workspace %s (limit %s minutes).",
                request.user.id,
                idle_for,
                workspace_slug,
                effective_minutes,
            )
            return (
                f"Your session for this workspace has been idle for longer than the "
                f"{effective_minutes}-minute limit set by its security policy. Please sign in again."
            )

    WorkspaceMember.objects.filter(pk=member.pk).update(last_workspace_activity_at=now)
    return None
