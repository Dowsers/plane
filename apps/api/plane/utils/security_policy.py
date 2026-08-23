# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 6 ("Politiques de securite configurables") -
shared application-level checks used by both the auth-provider SSO
enforcement path and the workspace security-policy view. Kept out of
`plane.db.models` (plain functions, not model methods) since several of
these cross model AND instance-config-store boundaries (`WorkspaceMember`,
`WorkspaceVerifiedDomain`, `Account`, `InstanceConfiguration`).
"""

import os
from typing import Optional

from plane.license.utils.instance_value import get_configuration_value


def instance_enabled_oauth_methods() -> list:
    """Which of GOOGLE/GITHUB are enabled at the INSTANCE (god-mode)
    level - the anti-lockout guard (exigence 4) requires at least one of
    these before `enforce_sso_only` may be turned on."""
    (is_google_enabled, is_github_enabled) = get_configuration_value(
        [
            {"key": "IS_GOOGLE_ENABLED", "default": os.environ.get("IS_GOOGLE_ENABLED", "0")},
            {"key": "IS_GITHUB_ENABLED", "default": os.environ.get("IS_GITHUB_ENABLED", "0")},
        ]
    )
    methods = []
    if is_google_enabled == "1":
        methods.append("GOOGLE")
    if is_github_enabled == "1":
        methods.append("GITHUB")
    return methods


def get_sso_enforcement_for_email(email: str) -> Optional[dict]:
    """Exigence 3 - resolves an email against every verified domain, on
    every workspace, that has `enforce_sso_only=True`. Returns `None` when
    login/signup for this email should proceed normally, or a dict
    `{"workspace_slug": ..., "allowed_methods": [...]}` for the FIRST
    matching workspace (a domain covered by more than one enforcing
    workspace only ever needs to report one - the caller only needs to
    know login must be blocked and which OAuth methods to point at).

    Scoped by real per-workspace `WorkspaceVerifiedDomain.is_verified`
    rows, never a bare domain-string match - see that model's own
    docstring for why a domain verified by workspace A must never leak
    into satisfying workspace B's policy (it doesn't here: each row is
    read together with ITS OWN workspace's policy, never cross-matched).
    """
    from plane.db.models import WorkspaceVerifiedDomain

    domain = (email or "").rsplit("@", 1)[-1].strip().lower()
    if not domain:
        return None

    verified_domains = WorkspaceVerifiedDomain.objects.filter(
        domain=domain, is_verified=True
    ).select_related("workspace", "workspace__security_policy")

    for verified_domain in verified_domains:
        policy = getattr(verified_domain.workspace, "security_policy", None)
        if policy is None or not policy.enforce_sso_only:
            continue

        allowed = [m for m in (policy.allowed_auth_methods or []) if m in ("GOOGLE", "GITHUB")]
        if not allowed:
            # Misconfigured policy (enforce_sso_only=True but no OAuth
            # method whitelisted) - fall back to whatever OAuth the
            # instance itself has enabled, so the error message is never
            # empty/useless to the blocked user.
            allowed = instance_enabled_oauth_methods()

        return {"workspace_slug": verified_domain.workspace.slug, "allowed_methods": allowed}

    return None


def check_member_invite_allowed(user, workspace) -> bool:
    """Exigence 5 - `member_invite_restriction` gate for
    `WorkspaceInvitationsViewset.create` (the real invite-creation view).
    Defaults to `ADMINS_AND_ABOVE` when no `WorkspaceSecurityPolicy` row
    exists yet, matching the field's own model default.
    """
    from plane.app.permissions import ROLE, is_workspace_owner
    from plane.db.models import MemberInviteRestriction, WorkspaceMember

    policy = getattr(workspace, "security_policy", None)
    restriction = policy.member_invite_restriction if policy else MemberInviteRestriction.ADMINS_AND_ABOVE

    if restriction == MemberInviteRestriction.OWNER_ONLY:
        return is_workspace_owner(user, workspace.slug)

    membership = WorkspaceMember.objects.filter(workspace=workspace, member=user, is_active=True).first()
    if membership is None:
        return False

    if restriction == MemberInviteRestriction.ADMINS_AND_MEMBERS:
        return membership.role in (ROLE.ADMIN.value, ROLE.MEMBER.value)

    # ADMINS_AND_ABOVE (default).
    return membership.role == ROLE.ADMIN.value


def validate_enforce_sso_only_change(user, workspace, new_value: bool) -> Optional[str]:
    """Exigence 4 + exigence 10 anti-lockout guards for turning
    `enforce_sso_only` ON. Returns an error message string when the change
    must be rejected (400), or `None` when it may proceed. Never called
    (returns `None` immediately) when `new_value` is `False` - turning
    enforcement OFF can never lock anyone out.
    """
    if not new_value:
        return None

    # Exigence 4 - at least one OAuth method must be enabled at the
    # INSTANCE level, or nobody could ever satisfy this policy at all.
    if not instance_enabled_oauth_methods():
        return (
            "No OAuth method (Google/GitHub) is enabled at the instance level. "
            "Ask an instance administrator to enable one before enforcing SSO-only login."
        )

    # Exigence 10 - the acting Owner must not lock themselves out. This
    # fork's `Account` model (OAuth account link) is not domain-scoped -
    # unlike the spec's own wording ("compte OAuth lie a leur propre
    # domaine"), there is no per-domain OAuth account concept here, only a
    # per-user one - so this checks the closest real, honest equivalent:
    # does the acting Owner already have AT LEAST ONE linked OAuth account
    # (Google or GitHub) they could use to sign back in, regardless of
    # domain. Documented deviation from the spec's literal domain-scoped
    # wording, see this feature's own build notes.
    from plane.db.models import Account

    if not Account.objects.filter(user=user, provider__in=["google", "github"]).exists():
        return (
            "You must link a Google or GitHub account to your own profile before enforcing "
            "SSO-only login, to avoid locking yourself out of this workspace."
        )

    return None
