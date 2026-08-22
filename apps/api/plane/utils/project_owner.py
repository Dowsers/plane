# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 5 - "Rôle Owner dédié + Team/Project Owner
délégué", exigence 12 - auto-revoke `ProjectMember.is_owner` when a member
is demoted below project Admin (or deactivated - see
`should_revoke_project_owner`'s own docstring for why deactivation is
included too).

Deliberately explicit function calls at every real call site, NOT a
Django signal - this fork has added zero new signals across 10
already-shipped categories, and independently of that convention, at
least one real call site (`ProjectMember.objects.bulk_update()` in
`plane.app.views.project.member.ProjectMemberViewSet.create`, the
bulk-add-members endpoint) would silently bypass a signal-based
implementation anyway, since Django's `bulk_update()` never fires
`pre_save`/`post_save` signals or per-instance `save()` overrides.
"""

from typing import Iterable, Optional

from plane.utils.audit_log import log_audit_event


def should_revoke_project_owner(is_owner: bool, role: int, is_active: bool) -> bool:
    """Pure predicate, easy to unit test in isolation from any DB call.

    Revokes not only on a role drop below project Admin (20) - the
    exigence's own literal wording - but also when the member is
    deactivated (`is_active=False`) with role unchanged. That second case
    isn't in the spec's own wording, but is needed to avoid a real
    lockout: `unique_project_owner` only excludes rows with
    `is_owner=False`, not inactive ones, so an inactive-but-still-owner
    row would keep blocking any new Project Owner assignment via the
    partial unique constraint until the old row is cleared.
    """
    return bool(is_owner) and (role < 20 or not is_active)


def revoke_project_owner_if_ineligible(
    project_member,
    actor=None,
    request=None,
    reason: str = "demoted_below_admin",
) -> bool:
    """Single-instance path (project/member.py's `partial_update`,
    `destroy`, `leave`; workspace/member.py's `partial_update`/`destroy`
    when they touch exactly one `ProjectMember`). Saves and emits a
    `PROJECT_OWNER_REVOKED` audit entry + `project_owner.revoked` webhook
    event if (and only if) a change was actually needed - a no-op member
    update never fires spurious entries.

    For a bulk path (`ProjectMember.objects.bulk_update(...)`), do NOT
    call this per-instance before the bulk write - it would issue one
    UPDATE per row, defeating the point of batching. Instead, use
    `should_revoke_project_owner` directly to decide whether to flip
    `is_owner` on each in-memory instance before the single `bulk_update()`
    call (remembering to add `"is_owner"` to its field list), then call
    `emit_project_owner_revoked_events` below for the ones that changed.
    """
    if not should_revoke_project_owner(project_member.is_owner, project_member.role, project_member.is_active):
        return False

    project_member.is_owner = False
    project_member.save(update_fields=["is_owner", "updated_at"])
    emit_project_owner_revoked_events([project_member], actor=actor, request=request, reason=reason)
    return True


def emit_project_owner_revoked_events(project_members: Iterable, actor=None, request=None, reason: str = "") -> None:
    """Side-channel audit/webhook notification for one or more
    `ProjectMember` rows whose `is_owner` was JUST cleared (by the caller,
    e.g. inline in a bulk-update loop) - does not touch the database
    itself, so it's safe to call after a `bulk_update()` has already
    flushed the actual field change.
    """
    from plane.bgtasks.webhook_task import webhook_activity

    for project_member in project_members:
        log_audit_event(
            "PROJECT_OWNER_REVOKED",
            request=request,
            workspace=getattr(project_member, "workspace", None),
            actor=actor,
            target_type="Project",
            target_id=str(project_member.project_id),
            old_value={"owner_member_id": str(project_member.member_id)},
            new_value=None,
            metadata={"reason": reason, "member_id": str(project_member.member_id)},
        )
        webhook_activity.delay(
            event="project_owner",
            verb="revoked",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=str(actor.id) if actor is not None else None,
            slug=getattr(getattr(project_member, "workspace", None), "slug", None),
            current_site="",
            event_id=str(project_member.project_id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={
                "project_id": str(project_member.project_id),
                "member_id": str(project_member.member_id),
                "reason": reason,
            },
        )


def guard_against_ineligible_owner_grant(role: int) -> Optional[str]:
    """Exigence 13 - a Guest (role=5) can never receive Project Owner
    status. Returns an error string if the grant should be rejected,
    `None` if it's fine - callers turn a non-`None` return into an HTTP
    400/403 response; this module deliberately returns instead of raising
    so it composes with each call site's own existing error-response
    style rather than forcing one exception type on all of them.
    """
    if role < 20:
        return "Only a member with the project Admin role can be made Project Owner."
    return None
