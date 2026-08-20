# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Generic per-object access check - category 9 (AI features,
docs/feature-specs/09-ai-features.md in plane-selfhost), feature 3
("Assistant de chat IA in-app"). Confirmed genuinely new plumbing: every
real permission class in this codebase (`plane.app.permissions.project.
ProjectEntityPermission` et al.) is queryset-filter/URL-kwarg-driven, built
to gate a DRF view for the object(s) already implied by the URL - none of
them answer "can THIS user read/write THAT arbitrary object, identified
only by a `(target_model, target_object_id)` pair pulled out of an AI
chat's stored context or a change proposal". This module is that missing
piece, used for exactly two purposes:

1. Exigence 3 - filtering what context gets fed into the LLM prompt, so
   the assistant never exposes an issue/cycle/module/page/project the
   requesting user cannot actually read, even if it's reachable via a
   link (an `IssueRelation`, a cycle/module FK, ...) from an object they
   otherwise have legitimate access to. See
   `plane.utils.ai_chat_assistant.build_conversation_context`.
2. Exigence 6 - gating who may APPROVE (or, by the same read check,
   propose in "propose" mode) a change: "l'auteur de la demande initiale
   au chat n'est pas automatiquement autorise a approuver si son role ne
   le permet pas sur l'objet cible" - checked against the SPECIFIC target
   object's own project membership, never a general workspace role.

Access rule per `target_model` (all keyed on an ACTIVE `ProjectMember`/
`WorkspaceMember` row, `role >= min_role`, matching the real 20/15/5
Admin/Member/Guest scale used everywhere else in this codebase - see
`plane.db.models.project.ROLE`):

- `workspace`: active `WorkspaceMember`.
- `project`: active `ProjectMember` on that project.
- `issue`/`cycle`/`module`: active `ProjectMember` on the object's own
  `project_id` (looked up first - a nonexistent object is always denied,
  never silently "no restriction").
- `page`: the page's own owner always passes (mirrors
  `plane.app.permissions.page.ProjectPagePermission` - "Allow access if
  the user is the owner"). A PRIVATE page (`Page.PRIVATE_ACCESS`) denies
  every non-owner outright, same as that permission class's base
  `_has_private_page_action_access` (no feature-flag override exists in
  this fork to extend that). A PUBLIC page requires active membership
  (`role >= min_role`) on at least one of the page's linked projects, or
  - for a page with no linked project at all (a workspace-global page) -
  plain active `WorkspaceMember` membership.

Never raises - any lookup failure (unknown model, malformed id, deleted
object) is treated as "no access", never a 500, matching this codebase's
established "never crash on an AI-adjacent permission check" convention
(e.g. `plane.utils.issue_triage_suggestion` module docstring).
"""

from typing import Optional
from uuid import UUID

from plane.db.models.project import ROLE

READ_MIN_ROLE = ROLE.GUEST.value
WRITE_MIN_ROLE = ROLE.MEMBER.value


def can_user_access_object(user, workspace, target_model: str, target_object_id, min_role: int = READ_MIN_ROLE) -> bool:
    """Returns whether `user` has at least `min_role` (default: any active
    membership at all, i.e. read access) on the object identified by
    `(target_model, target_object_id)` within `workspace`.

    `target_model` is one of "workspace", "project", "issue", "cycle",
    "module", "page" (case-insensitive). `target_object_id` may be `None`
    only when `target_model == "workspace"`.
    """
    from plane.db.models import Cycle, Module, Page, ProjectMember, WorkspaceMember

    if user is None or getattr(user, "is_anonymous", False) or workspace is None:
        return False

    target_model = (target_model or "").strip().lower()

    try:
        if target_model == "workspace":
            return WorkspaceMember.objects.filter(
                workspace=workspace, member=user, role__gte=min_role, is_active=True
            ).exists()

        if target_object_id is None:
            return False
        # Normalize/validate the id early - a malformed id is never an
        # access grant.
        target_object_id = UUID(str(target_object_id))

        if target_model == "project":
            return ProjectMember.objects.filter(
                workspace=workspace,
                project_id=target_object_id,
                member=user,
                role__gte=min_role,
                is_active=True,
            ).exists()

        if target_model in ("issue", "cycle", "module"):
            model = {"issue": _issue_model(), "cycle": Cycle, "module": Module}[target_model]
            obj = model.objects.filter(id=target_object_id, workspace=workspace).only("id", "project_id").first()
            if obj is None:
                return False
            return ProjectMember.objects.filter(
                workspace=workspace,
                project_id=obj.project_id,
                member=user,
                role__gte=min_role,
                is_active=True,
            ).exists()

        if target_model == "page":
            page = Page.objects.filter(id=target_object_id, workspace=workspace).first()
            if page is None:
                return False
            if page.owned_by_id == user.id:
                return True
            if page.access == Page.PRIVATE_ACCESS:
                return False
            project_ids = list(page.projects.values_list("id", flat=True))
            if not project_ids:
                return WorkspaceMember.objects.filter(
                    workspace=workspace, member=user, role__gte=min_role, is_active=True
                ).exists()
            return ProjectMember.objects.filter(
                workspace=workspace,
                project_id__in=project_ids,
                member=user,
                role__gte=min_role,
                is_active=True,
            ).exists()

        return False
    except Exception:
        return False


def _issue_model():
    from plane.db.models import Issue

    return Issue


def context_type_to_target_model(context_type: str) -> Optional[str]:
    """`AIConversationContextType` values map 1:1 onto
    `can_user_access_object`'s `target_model` vocabulary - this exists
    purely so call sites don't hardcode that the two enums happen to share
    spelling."""
    valid = {"workspace", "project", "issue", "cycle", "module", "page"}
    context_type = (context_type or "").strip().lower()
    return context_type if context_type in valid else None
