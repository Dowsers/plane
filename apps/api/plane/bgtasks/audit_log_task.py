# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), features 3 ("Journal d'audit de sécurité workspace") + 5
("Rôle Owner dédié + Team/Project Owner délégué") merged implementation.

Exigence 12 (feature 3) - creating an audit-log entry must never slow down
or fail the triggering business action, so the actual DB write happens
here, in a Celery task, fired-and-forgotten from the call site via
`plane.utils.audit_log.log_audit_event` - matching this fork's existing
pattern of Celery tasks called from view code (see e.g.
`plane.bgtasks.webhook_task.webhook_activity`, which this module also
calls to deliver the opt-in `audit_log.created` webhook event, exigence 14).
"""

import logging
from typing import Any, Optional

from celery import shared_task

from plane.db.models import User, WorkspaceAuditLog, WorkspaceMember
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.worker")


def _write_entry(
    event_type: str,
    workspace_id: Optional[str],
    workspace_slug: Optional[str],
    actor_id: Optional[str],
    target_user_id: Optional[str],
    target_type: str,
    target_id: str,
    old_value: Any,
    new_value: Any,
    metadata: dict,
    ip_address: Optional[str],
    user_agent: str,
) -> WorkspaceAuditLog:
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    target_user = User.objects.filter(pk=target_user_id).first() if target_user_id else None

    entry = WorkspaceAuditLog.objects.create(
        workspace_id=workspace_id,
        actor=actor,
        actor_email_snapshot=actor.email if actor else "",
        target_user=target_user,
        target_email_snapshot=target_user.email if target_user else "",
        target_type=target_type or "",
        target_id=target_id or "",
        event_type=event_type,
        old_value=old_value,
        new_value=new_value,
        metadata=metadata or {},
        ip_address=ip_address,
        user_agent=user_agent or "",
    )

    # Exigence 14 (feature 3) - opt-in webhook notification of audit-log
    # creation, gated by the shared `workspace_security` boolean column
    # (decision #5, plane.db.models.webhook.Webhook.workspace_security) -
    # only for workspace-scoped entries; instance-scoped entries
    # (workspace=null, e.g. OAUTH_CONFIG_UPDATED) have no workspace webhook
    # to notify.
    if workspace_id and workspace_slug:
        from plane.bgtasks.webhook_task import webhook_activity

        webhook_activity.delay(
            event="audit_log",
            verb="created",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=actor_id,
            slug=workspace_slug,
            current_site="",
            event_id=str(entry.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={
                "id": str(entry.id),
                "workspace": workspace_id,
                "event_type": event_type,
                "actor": actor_id,
                "target_user": target_user_id,
                "created_at": entry.created_at.isoformat(),
                "metadata": metadata or {},
            },
        )

    return entry


@shared_task
def create_audit_log_entry(
    event_type: str,
    workspace_id: Optional[str] = None,
    workspace_slug: Optional[str] = None,
    actor_id: Optional[str] = None,
    target_user_id: Optional[str] = None,
    target_type: str = "",
    target_id: str = "",
    old_value: Any = None,
    new_value: Any = None,
    metadata: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: str = "",
    fan_out_actor_workspaces: bool = False,
) -> None:
    """Async write of one (or, when `fan_out_actor_workspaces=True`, one
    per active workspace membership of the actor) `WorkspaceAuditLog` row.

    `fan_out_actor_workspaces` covers event types that are fundamentally
    user-level, not naturally scoped to a single workspace at the moment
    they happen (LOGIN_SUCCESS/LOGIN_FAILED/LOGOUT/PASSWORD_CHANGED,
    API_TOKEN_CREATED/API_TOKEN_REVOKED - Plane's session login is
    instance-wide, not per-workspace, and `APIToken.workspace` is not a
    reliable per-workspace link for personal tokens either, see
    `plane.api.views.rate_limit.RateLimitStatusEndpoint`'s own docstring) -
    yet exigence 13 requires every entry be strictly scoped to exactly one
    `workspace_id`, and exigence 1's own user story frames these events as
    something "a workspace Admin" reviews in THAT workspace's log. The
    resolution: write one row per workspace the actor is an active member
    of, so every workspace whose Admin/Owner might care about this actor's
    login/token activity sees it in their own log. If the actor has no
    resolvable active workspace membership at all (e.g. a LOGIN_FAILED for
    an email that doesn't match any known user), there is nowhere
    meaningful to scope the entry to, and it is deliberately dropped
    rather than written with a null workspace (which exigence 2's own
    model reserves for genuinely instance-scoped events only).
    """
    try:
        if fan_out_actor_workspaces:
            if not actor_id:
                return
            memberships = WorkspaceMember.objects.filter(member_id=actor_id, is_active=True).select_related(
                "workspace"
            )
            for membership in memberships:
                _write_entry(
                    event_type=event_type,
                    workspace_id=str(membership.workspace_id),
                    workspace_slug=membership.workspace.slug,
                    actor_id=actor_id,
                    target_user_id=target_user_id,
                    target_type=target_type,
                    target_id=target_id,
                    old_value=old_value,
                    new_value=new_value,
                    metadata=metadata,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            return

        _write_entry(
            event_type=event_type,
            workspace_id=workspace_id,
            workspace_slug=workspace_slug,
            actor_id=actor_id,
            target_user_id=target_user_id,
            target_type=target_type,
            target_id=target_id,
            old_value=old_value,
            new_value=new_value,
            metadata=metadata,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except Exception as e:
        # Exigence 12 - an audit-log write failure must never surface to
        # (or retry against) the triggering business action, which has
        # already completed by the time this task runs.
        logger.error(f"Failed to write audit log entry for event {event_type}: {e}")
        log_exception(e)
