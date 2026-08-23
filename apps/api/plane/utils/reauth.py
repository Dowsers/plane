# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 6 ("Politiques de securite configurables"),
exigence 8 - sensitive-action re-authentication.

`User.last_authenticated_at` (a NEW field - see its own docstring on the
model for why the obvious candidate, the pre-existing `token_updated_at`,
was rejected after empirical testing) is "moment of last real
authentication". It is stamped at every real login (email/password, magic
link, Google/GitHub/GitLab/Gitea OAuth) via the single login choke point
`plane.authentication.utils.login.user_login()`, and re-stamped by this
feature's own `POST /api/workspaces/<slug>/reauth/` endpoint
(`plane.app.views.workspace.security.WorkspaceReauthChallengeEndpoint`,
via `mark_reauthenticated()` below) on a successful password/OTP re-check -
without reimplementing any actual password/OTP verification logic, that
endpoint calls `EmailProvider`/`MagicCodeProvider.set_user_data()`
directly, the SAME classes the real login endpoints use.

IMPORTANT: both write sites use `User.objects.filter(pk=...).update(...)`
(a queryset-level `UPDATE`), never `user.save()` - a throwaway pytest probe
(run once during development, since deleted) empirically confirmed that
`User.save()` has a pre-existing, unrelated quirk: it silently bumps
`token_updated_at` (not this field) to `now()` on ANY save of a User
instance that already has a non-null `token_updated_at` in memory - e.g. a
routine `PATCH /api/users/me/` profile edit goes through this same
override. That is precisely why `last_authenticated_at` is a dedicated new
field instead of reusing `token_updated_at`: nothing else in this codebase
writes to `last_authenticated_at`, and using `.update()` (which never
calls `save()` or sends `post_save`) keeps it that way by construction.
"""

import logging
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

logger = logging.getLogger("plane.utils.reauth")

REAUTH_WINDOW_MINUTES = 15


def is_reauth_stale(user, max_age_minutes: int = REAUTH_WINDOW_MINUTES) -> bool:
    """True if `user` has no recorded real authentication moment, or it is
    older than `max_age_minutes`."""
    if user.last_authenticated_at is None:
        return True
    return timezone.now() - user.last_authenticated_at > timedelta(minutes=max_age_minutes)


def mark_reauthenticated(user) -> None:
    """Call on successful re-auth challenge completion - refreshes the
    same timestamp a real login would, via `.update()` (see this module's
    own docstring for why not `user.save()`). Also refreshes the in-memory
    `user` object passed in, so a caller that immediately re-checks
    `is_reauth_stale(user)` in the same request sees the fresh value."""
    from plane.db.models import User

    now = timezone.now()
    User.objects.filter(pk=user.pk).update(last_authenticated_at=now)
    user.last_authenticated_at = now


def workspace_force_reauth_enabled(workspace) -> bool:
    if workspace is None:
        return False
    policy = getattr(workspace, "security_policy", None)
    return bool(policy and policy.force_reauth_for_sensitive_actions)


def any_owned_workspace_force_reauth_enabled(user) -> bool:
    """Fallback scope for sensitive actions with no single natural
    workspace to check against - see
    `plane.app.views.api.ApiTokenEndpoint.delete`'s own comment for why
    (personal API tokens in this fork are not workspace-scoped, unlike the
    spec's own assumption). Since only a real workspace Owner can turn
    `force_reauth_for_sensitive_actions` on in the first place, gating on
    "does the acting user own ANY workspace with this policy enabled"
    is the closest honest approximation available without a workspace-
    scoped API token model to check against directly."""
    from plane.db.models import WorkspaceSecurityPolicy

    return WorkspaceSecurityPolicy.objects.filter(
        workspace__owner_id=user.id, force_reauth_for_sensitive_actions=True
    ).exists()


def reauth_required_response() -> Response:
    return Response(
        {
            "error_code": "REAUTH_REQUIRED",
            "error_message": "REAUTH_REQUIRED",
            "detail": "This action requires you to confirm your identity again before continuing.",
        },
        status=status.HTTP_401_UNAUTHORIZED,
    )


def guard_sensitive_action(user, workspace=None, any_owned_workspace: bool = False):
    """Returns a `Response` (401) if this sensitive action must be blocked
    pending re-auth, else `None`. Call at the top of a sensitive-action
    view body, e.g.::

        blocked = guard_sensitive_action(request.user, workspace=workspace)
        if blocked:
            return blocked

    `any_owned_workspace=True` is for actions with no single natural
    workspace to check (see `any_owned_workspace_force_reauth_enabled`
    above) - mutually exclusive with passing `workspace`.
    """
    enabled = (
        any_owned_workspace_force_reauth_enabled(user)
        if any_owned_workspace
        else workspace_force_reauth_enabled(workspace)
    )
    if not enabled:
        return None
    if is_reauth_stale(user):
        return reauth_required_response()
    return None
