# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.auth import login
from django.conf import settings

# Module imports
from plane.db.models import AuditEventType
from plane.utils.audit_log import log_audit_event
from plane.utils.host import base_host
from plane.utils.ip_address import get_client_ip


def user_login(request, user, is_app=False, is_admin=False, is_space=False):
    """Single choke point for session issuance across every auth provider
    (email/password, magic link, Google/GitHub/GitLab/Gitea OAuth) and
    both the app and space surfaces - `django.contrib.auth.login()` below
    IS Plane's real session mechanism (a Django cookie session, not a
    JWT). Category 11 (docs/feature-specs/11-admin-security-sso.md in
    plane-selfhost), features 3+5 merged, exigence 1 - `LOGIN_SUCCESS` is
    emitted from exactly here rather than at each of the ~10 individual
    provider/surface call sites, so every login path is covered by
    construction.
    """
    login(request=request, user=user)

    # If is admin cookie set the custom age
    if is_admin:
        request.session.set_expiry(settings.ADMIN_SESSION_COOKIE_AGE)

    device_info = {
        "user_agent": request.META.get("HTTP_USER_AGENT", ""),
        "ip_address": get_client_ip(request=request),
        "domain": base_host(request=request, is_app=is_app, is_admin=is_admin, is_space=is_space),
    }
    request.session["device_info"] = device_info
    request.session.save()

    # See `plane.bgtasks.audit_log_task.create_audit_log_entry`'s own
    # docstring for why this fans out across the user's active workspace
    # memberships rather than trying to pick a single one.
    log_audit_event(
        AuditEventType.LOGIN_SUCCESS,
        request=request,
        actor=user,
        target_user=user,
        metadata={"domain": device_info["domain"]},
        fan_out_actor_workspaces=True,
    )
    return
