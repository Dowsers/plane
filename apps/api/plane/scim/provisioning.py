# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

Business logic shared by the `Users` collection/detail views
(`plane.scim.views.users`) - creation, PATCH/PUT mutation, and
deactivation. Kept separate from the HTTP-wiring view classes so the two
concerns (protocol shape vs. what a create/deactivate actually DOES to
`User`/`WorkspaceMember`) stay independently readable.

New-user creation state (exigence 4 - "un nouveau User est cree en etat
'provisionne, invitation en attente' tant que le premier login n'a pas eu
lieu"): this fork's own real invite flow (`WorkspaceJoinEndpoint`/
`UserWorkspaceInvitationsViewSet`, `plane.app.views.workspace.invite`)
never actually creates a `User` row at invite time at all - it only creates
one once the invitee completes a real login/signup. SCIM's whole premise
is the opposite (proactive creation, no self-service signup expected), so
there is no direct precedent for a persisted "pending" `User` row. The
closest real, already-shipped precedent for "a `User` that exists but has
never logged in" is JIT/system provisioning
(`plane.authentication.adapter.base.Adapter.complete_login_or_signup`'s own
new-user branch, and `plane.utils.integration_bot.
get_or_create_integration_bot`): `is_password_autoset=True` (no usable
password - reused here for exactly the same "provisioned, no credential of
their own yet" meaning), `is_email_verified=True`, and simply never setting
`last_login_time` - a SCIM-provisioned user is indistinguishable from that
same state until they actually authenticate via whatever real login method
this instance's SAML/OAuth/credential config offers them.

No invitation EMAIL is sent (unlike the manual invite flow) - a directory
sync can provision a large batch of users at once, and exigence 4 describes
an account STATE, not an email side effect; SCIM-provisioned users are
expected to authenticate via this instance's real login surface (most
commonly the SAML SSO this same category's feature 1 already ships)
whenever their IdP redirects them there, not via a Plane-emailed invite
link.
"""

import uuid
from typing import Optional

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone

from plane.bgtasks.webhook_task import webhook_activity
from plane.db.models import AuditEventType, ProjectMember, User, WorkspaceMember
from plane.scim.exceptions import SCIMError
from plane.scim.resources import extract_username_or_email, resolve_role_from_extension
from plane.utils.audit_log import log_audit_event
from plane.utils.cache import invalidate_cache_directly
from plane.utils.host import base_host
from plane.utils.project_owner import emit_project_owner_revoked_events
from plane.utils.view_subscriptions import deactivate_user_view_subscriptions

# Exigence 9 - the two lifecycle webhook events this feature's data-model
# section names (`member.scim_provisioned`/`member.scim_deprovisioned`),
# translated into this fork's existing (event, verb) decomposition rather
# than a single dotted string - the SAME translation feature 6 already did
# for its own spec-named events (`workspace_security_policy.updated` ->
# event="security_policy", verb="updated"). Reuses decision #4's
# `Webhook.workspace_security` boolean column - see
# `plane.bgtasks.webhook_task.WORKSPACE_SECURITY_EVENTS`, which this
# feature adds "scim_provisioning" to.
SCIM_WEBHOOK_EVENT = "scim_provisioning"


def is_current_owner(workspace, member: WorkspaceMember) -> bool:
    """Decision #6 - "last Owner" protection, reframed against the REAL
    `Workspace.owner` invariant this category's own features 3+5 already
    established (always-present, single, active Admin). SCIM must never be
    able to deactivate/remove the `WorkspaceMember` row that IS the
    workspace's current Owner - not a vaguer "count of Admins" heuristic."""
    return workspace.owner_id == member.member_id


def _extension_metadata(scim_token) -> dict:
    return {"scim_token_id": str(scim_token.id), "scim_token_label": scim_token.label}


def _validated_email(raw_email: Optional[str]) -> str:
    email = (raw_email or "").strip().lower()
    if not email:
        raise SCIMError(detail="userName or a primary email is required.", status_code=400, scim_type="invalidValue")
    try:
        validate_email(email)
    except ValidationError:
        raise SCIMError(detail=f"'{email}' is not a valid email address.", status_code=400, scim_type="invalidValue")
    return email


def create_scim_user(workspace, payload: dict, scim_token, request) -> WorkspaceMember:
    """Exigence 4/8/9 - `POST /Users`. Raises `SCIMError` on any validation
    failure (never returns a partially-created row)."""
    email = _validated_email(extract_username_or_email(payload))
    role = resolve_role_from_extension(payload)  # Never "owner" - raises otherwise.
    external_id = (payload.get("externalId") or "").strip() or None
    active = payload.get("active", True)
    if active is None:
        active = True

    # Exigence 4/6 - dedupe by email (a `User` is unique-by-email at the
    # INSTANCE level, never duplicated) AND by prior membership in THIS
    # workspace specifically (RFC 7644's own POST-conflicts-with-existing-
    # resource semantics - an IdP whose own state is out of sync should
    # see a real 409, then resolve it via its own GET/filter + PATCH
    # reconciliation, not have Plane silently merge/duplicate on its
    # behalf).
    existing_member = WorkspaceMember.objects.filter(workspace=workspace, member__email=email).first()
    if existing_member is not None:
        raise SCIMError(
            detail=f"A user with email '{email}' already exists in this workspace.",
            status_code=409,
            scim_type="uniqueness",
        )
    if external_id and WorkspaceMember.objects.filter(workspace=workspace, scim_external_id=external_id).exists():
        raise SCIMError(
            detail=f"externalId '{external_id}' is already in use in this workspace.",
            status_code=409,
            scim_type="uniqueness",
        )

    user = User.objects.filter(email=email).first()
    created_new_user = user is None
    if user is None:
        name = payload.get("name") or {}
        # Mirrors plane.authentication.adapter.base.Adapter.
        # complete_login_or_signup's own new-user branch - see module
        # docstring for the full reasoning.
        user = User(
            email=email,
            username=uuid.uuid4().hex,
            first_name=(name.get("givenName") or ""),
            last_name=(name.get("familyName") or ""),
        )
        user.set_password(uuid.uuid4().hex)
        user.is_password_autoset = True
        user.is_email_verified = True
        user.save()
    elif user.is_bot:
        # Mirrors Adapter.complete_login_or_signup's own bot-account guard
        # - a bot/agent identity must never be attached to a workspace as
        # a SCIM-provisioned human member.
        raise SCIMError(detail="This email belongs to a system/bot account.", status_code=400, scim_type="invalidValue")

    member = WorkspaceMember.objects.create(
        workspace=workspace,
        member=user,
        role=role,
        is_active=bool(active),
        scim_external_id=external_id,
        scim_managed=True,
    )

    log_audit_event(
        AuditEventType.SCIM_USER_CREATED,
        request=request,
        workspace=workspace,
        actor=scim_token.created_by,
        target_user=user,
        new_value={"role": role, "active": member.is_active, "external_id": external_id},
        metadata={**_extension_metadata(scim_token), "created_new_user": created_new_user},
    )
    webhook_activity.delay(
        event=SCIM_WEBHOOK_EVENT,
        verb="provisioned",
        field=None,
        old_value=None,
        new_value=None,
        actor_id=str(scim_token.created_by.id) if scim_token.created_by else None,
        slug=workspace.slug,
        current_site=base_host(request=request, is_app=True),
        event_id=str(member.id),
        old_identifier=None,
        new_identifier=None,
        event_data_override={
            "workspace_id": str(workspace.id),
            "member_id": str(member.id),
            "email": email,
            "role": role,
        },
    )
    invalidate_cache_directly(
        path=f"/api/workspaces/{workspace.slug}/members/", user=False, request=request, multiple=True
    )

    return member


def deactivate_member(
    workspace, member: WorkspaceMember, scim_token, request, verb: str = "deprovisioned"
) -> WorkspaceMember:
    """Exigence 6/7/13 - `PATCH active:false` AND `DELETE` both funnel
    through this one function (DELETE is ALWAYS treated as `active:false` -
    a workspace-scoped removal, never physical `User` deletion or loss of
    historical contributions - exigence 7's own explicit requirement).

    Idempotent: deactivating an already-inactive member is a silent no-op
    (no duplicate audit entry/webhook), matching how a real directory sync
    might re-send the same deprovisioning event more than once.
    """
    if is_current_owner(workspace, member):
        raise SCIMError(
            detail="The workspace Owner cannot be deactivated via SCIM.",
            status_code=409,
            scim_type="mutability",
        )

    if not member.is_active:
        return member

    # Mirrors plane.app.views.workspace.member.WorkSpaceMemberViewSet.
    # destroy()'s own cascade - a deactivated WorkspaceMember alone does
    # NOT revoke ProjectMember-level access (ProjectEntityPermission checks
    # ProjectMember.is_active directly, not WorkspaceMember.is_active), so
    # skipping this would leave a deprovisioned user with live access to
    # any project they were already a member of - a real security gap
    # given this feature's own motivation (closing offboarding gaps).
    revoked_owner_project_members = list(
        ProjectMember.objects.filter(
            workspace=workspace, member_id=member.member_id, is_active=True, is_owner=True
        ).select_related("workspace")
    )
    ProjectMember.objects.filter(workspace=workspace, member_id=member.member_id, is_active=True).update(
        is_active=False, is_owner=False, updated_at=timezone.now()
    )
    if revoked_owner_project_members:
        emit_project_owner_revoked_events(
            revoked_owner_project_members, actor=scim_token.created_by, request=request, reason="scim_deprovisioned"
        )

    member.is_active = False
    member.save()
    deactivate_user_view_subscriptions(member.member_id, workspace.slug)

    log_audit_event(
        AuditEventType.SCIM_USER_DEACTIVATED,
        request=request,
        workspace=workspace,
        actor=scim_token.created_by,
        target_user=member.member,
        old_value={"is_active": True},
        new_value={"is_active": False},
        metadata=_extension_metadata(scim_token),
    )
    webhook_activity.delay(
        event=SCIM_WEBHOOK_EVENT,
        verb=verb,
        field=None,
        old_value=None,
        new_value=None,
        actor_id=str(scim_token.created_by.id) if scim_token.created_by else None,
        slug=workspace.slug,
        current_site=base_host(request=request, is_app=True),
        event_id=str(member.id),
        old_identifier=None,
        new_identifier=None,
        event_data_override={"workspace_id": str(workspace.id), "member_id": str(member.id)},
    )
    invalidate_cache_directly(
        path=f"/api/workspaces/{workspace.slug}/members/", user=False, request=request, multiple=True
    )

    return member


def reactivate_member(workspace, member: WorkspaceMember, scim_token, request) -> WorkspaceMember:
    """`PATCH active:true`. Only reactivates the `WorkspaceMember` row
    itself - matching `WorkspaceJoinEndpoint.post`'s own reactivation
    behavior (accepting a fresh invite for a previously-removed member
    also only flips `WorkspaceMember.is_active`, it never resurrects that
    member's old `ProjectMember` rows) - project access must be re-granted
    separately, by whatever process (SCIM group mapping is out of scope
    for v1, decision #1) or manual action grants it."""
    if member.is_active:
        return member

    member.is_active = True
    member.save()

    log_audit_event(
        AuditEventType.SCIM_USER_UPDATED,
        request=request,
        workspace=workspace,
        actor=scim_token.created_by,
        target_user=member.member,
        old_value={"is_active": False},
        new_value={"is_active": True},
        metadata=_extension_metadata(scim_token),
    )
    webhook_activity.delay(
        event=SCIM_WEBHOOK_EVENT,
        verb="provisioned",
        field=None,
        old_value=None,
        new_value=None,
        actor_id=str(scim_token.created_by.id) if scim_token.created_by else None,
        slug=workspace.slug,
        current_site=base_host(request=request, is_app=True),
        event_id=str(member.id),
        old_identifier=None,
        new_identifier=None,
        event_data_override={"workspace_id": str(workspace.id), "member_id": str(member.id)},
    )
    invalidate_cache_directly(
        path=f"/api/workspaces/{workspace.slug}/members/", user=False, request=request, multiple=True
    )

    return member


def replace_scim_user(workspace, member: WorkspaceMember, payload: dict, scim_token, request) -> WorkspaceMember:
    """`PUT /Users/{id}` - full replace of the mutable attributes this
    feature actually maps (exigence 8), reusing `deactivate_member`/
    `reactivate_member` for the `active` transition specifically (so a PUT
    that flips `active` gets the exact same Owner-protection/cascade/
    audit/webhook behavior as a PATCH would, never a shortcut around it).
    """
    role = resolve_role_from_extension(payload)

    name = payload.get("name") or {}
    User.objects.filter(pk=member.member_id).update(
        first_name=name.get("givenName") or "", last_name=name.get("familyName") or ""
    )

    email = extract_username_or_email(payload)
    if email:
        _replace_email(workspace, member, email)

    external_id = (payload.get("externalId") or "").strip() or None
    if external_id != member.scim_external_id:
        if (
            external_id
            and WorkspaceMember.objects.filter(workspace=workspace, scim_external_id=external_id)
            .exclude(pk=member.pk)
            .exists()
        ):
            raise SCIMError(
                detail=f"externalId '{external_id}' is already in use in this workspace.",
                status_code=409,
                scim_type="uniqueness",
            )
        member.scim_external_id = external_id

    old_role = member.role
    member.role = role
    member.save()

    active = payload.get("active", True)
    if active is None:
        active = True
    if bool(active) != member.is_active:
        if active:
            reactivate_member(workspace, member, scim_token, request)
        else:
            deactivate_member(workspace, member, scim_token, request)

    if old_role != role:
        log_audit_event(
            AuditEventType.SCIM_USER_UPDATED,
            request=request,
            workspace=workspace,
            actor=scim_token.created_by,
            target_user=member.member,
            old_value={"role": old_role},
            new_value={"role": role},
            metadata=_extension_metadata(scim_token),
        )

    member.refresh_from_db()
    return member


# PATCH scope (per this feature's own implementation brief - "CRITICAL
# CONTEXT" section): `replace` operations on exactly these 4 attributes.
# Any other op/path combination is REJECTED with a real SCIM 400, never
# silently ignored - see apply_patch_operations below.
SUPPORTED_PATCH_PATHS = {"active", "name.givenname", "name.familyname", "emails"}


def _apply_single_replace(workspace, member: WorkspaceMember, scim_token, request, path: str, value) -> None:
    path_lower = (path or "").strip().lower()

    if path_lower == "active":
        if bool(value):
            reactivate_member(workspace, member, scim_token, request)
        else:
            deactivate_member(workspace, member, scim_token, request)
        return

    if path_lower == "name.givenname":
        User.objects.filter(pk=member.member_id).update(first_name=value or "")
        return

    if path_lower == "name.familyname":
        User.objects.filter(pk=member.member_id).update(last_name=value or "")
        return

    if path_lower == "emails":
        _replace_email(workspace, member, value)
        return

    raise SCIMError(
        detail=f"Unsupported PATCH path '{path}'. Supported: active, name.givenName, name.familyName, emails.",
        status_code=400,
        scim_type="invalidPath",
    )


def _replace_email(workspace, member: WorkspaceMember, value) -> None:
    """`value` is either a bare string or the SCIM `emails` array shape
    (`[{"value": "...", "primary": true}, ...]`) - Azure AD/Okta both send
    the array shape for a `path=emails` PATCH. Only the primary (or first)
    entry is honored - this fork's `User.email` is a single, global,
    unique field, not a multi-valued list.

    NOTE (spec's own open question #3, unresolved by this feature):
    `User` is instance-wide, not per-workspace - changing it here changes
    that person's login email/identity in EVERY workspace they belong to,
    not just this one. This is an inherent consequence of this fork's data
    model, not something this PATCH handler can scope more narrowly.
    """
    if isinstance(value, list):
        primary = next((e.get("value") for e in value if isinstance(e, dict) and e.get("primary")), None)
        new_email = primary or (value[0].get("value") if value and isinstance(value[0], dict) else None)
    elif isinstance(value, str):
        new_email = value
    else:
        new_email = None

    new_email = _validated_email(new_email)
    if new_email == member.member.email:
        return

    if User.objects.filter(email=new_email).exclude(pk=member.member_id).exists():
        raise SCIMError(
            detail=f"'{new_email}' is already in use by another account.", status_code=409, scim_type="uniqueness"
        )
    User.objects.filter(pk=member.member_id).update(email=new_email)


def _validate_path(path: str) -> None:
    if (path or "").strip().lower() not in SUPPORTED_PATCH_PATHS:
        raise SCIMError(
            detail=f"Unsupported PATCH path '{path}'. Supported: active, name.givenName, name.familyName, emails.",
            status_code=400,
            scim_type="invalidPath",
        )


def apply_patch_operations(
    workspace, member: WorkspaceMember, operations: list, scim_token, request
) -> WorkspaceMember:
    """Exigence 6 / this feature's own "CRITICAL CONTEXT" scope. Every
    `Operations[]` entry must be `op="replace"` on one of
    `SUPPORTED_PATCH_PATHS` - handles BOTH real-world payload shapes:

      {"op": "replace", "path": "active", "value": false}
      {"op": "replace", "value": {"active": false}}   # path omitted

    (Azure AD commonly omits `path` and sends a `value` object with
    several attributes in one operation; Okta typically sends one `path`
    per operation.) Any operation with `op` other than `replace`
    (case-insensitive), or a `path`/`value`-key not in
    `SUPPORTED_PATCH_PATHS`, raises a real SCIM 400 - never silently
    ignored.

    ATOMIC: every operation in the request is validated (op + path shape)
    BEFORE any of them are applied, so a request with one bad operation
    among several good ones makes NO changes at all, rather than partially
    applying the earlier ones and then erroring on a later one.
    """
    if not operations:
        raise SCIMError(
            detail="Operations is required and must be non-empty.", status_code=400, scim_type="invalidValue"
        )

    parsed = []  # [(path, value), ...] - flattened, validated, not yet applied.
    for operation in operations:
        op = str(operation.get("op") or "").strip().lower()
        if op != "replace":
            raise SCIMError(
                detail=f"Unsupported PATCH op '{operation.get('op')}'. Only 'replace' is supported.",
                status_code=400,
                scim_type="invalidValue",
            )

        path = operation.get("path")
        value = operation.get("value")

        if path:
            _validate_path(path)
            parsed.append((path, value))
        elif isinstance(value, dict):
            for sub_path, sub_value in value.items():
                _validate_path(sub_path)
                parsed.append((sub_path, sub_value))
        else:
            raise SCIMError(
                detail="A 'replace' operation requires either 'path' or an object 'value'.",
                status_code=400,
                scim_type="invalidValue",
            )

    for path, value in parsed:
        _apply_single_replace(workspace, member, scim_token, request, path, value)

    member.refresh_from_db()
    return member
