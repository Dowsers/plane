# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), features 3+5 merged - thin call-site helper around
`plane.bgtasks.audit_log_task.create_audit_log_entry`. Call this directly
from view code (or from another bgtask, e.g. the auto-revoke helper in
`plane.utils.project_owner`) - it only extracts request metadata and
enqueues the actual DB write, it never touches the database itself, so it
is always safe to call on a user-facing request's critical path
(exigence 12).
"""

from typing import Any, Optional

from plane.bgtasks.audit_log_task import create_audit_log_entry
from plane.utils.ip_address import get_client_ip


def log_audit_event(
    event_type: str,
    request: Any = None,
    workspace: Any = None,
    actor: Any = None,
    target_user: Any = None,
    target_type: str = "",
    target_id: Optional[str] = None,
    old_value: Any = None,
    new_value: Any = None,
    metadata: Optional[dict] = None,
    fan_out_actor_workspaces: bool = False,
) -> None:
    """
    Args:
        event_type: one of `plane.db.models.audit.AuditEventType`.
        request: the originating HTTP request, if any - used only to
            capture `ip_address`/`user_agent` (exigence 2). Pass `None` for
            events with no request (e.g. an auto-revoke side effect
            triggered from within another bgtask).
        workspace: a `Workspace` instance, or `None` for a genuinely
            instance-scoped event (only `OAUTH_CONFIG_UPDATED` today) or
            when `fan_out_actor_workspaces=True` (in which case the actor's
            own active workspace memberships supply the scoping instead).
        actor: the `User` who performed the action, or `None` for a
            system-initiated event.
        target_user: the `User` this action targeted, when the target
            genuinely is a user (member invited/removed/role-changed,
            etc.) - leave `None` and use `target_type`/`target_id` instead
            for non-user targets (Project, Workspace).
        target_type / target_id: generalized target representation for
            non-user targets, e.g. `target_type="Project"`,
            `target_id=str(project.id)`.
        fan_out_actor_workspaces: see
            `plane.bgtasks.audit_log_task.create_audit_log_entry`'s own
            docstring - set this for user-level events with no single
            natural workspace (login/logout/password-change/API-token
            events).
    """
    ip_address = None
    user_agent = ""
    if request is not None:
        try:
            ip_address = get_client_ip(request=request)
        except Exception:
            ip_address = None
        user_agent = request.META.get("HTTP_USER_AGENT", "") if hasattr(request, "META") else ""

    create_audit_log_entry.delay(
        event_type=event_type,
        workspace_id=str(workspace.id) if workspace is not None else None,
        workspace_slug=workspace.slug if workspace is not None else None,
        actor_id=str(actor.id) if actor is not None else None,
        target_user_id=str(target_user.id) if target_user is not None else None,
        target_type=target_type,
        target_id=str(target_id) if target_id else "",
        old_value=old_value,
        new_value=new_value,
        metadata=metadata or {},
        ip_address=ip_address,
        user_agent=user_agent,
        fan_out_actor_workspaces=fan_out_actor_workspaces,
    )
