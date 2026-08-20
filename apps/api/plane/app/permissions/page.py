# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import ProjectMember, Page, Project
from plane.app.permissions import ROLE


from rest_framework.permissions import BasePermission, SAFE_METHODS


# Permission Mappings for workspace members
ADMIN = ROLE.ADMIN.value
MEMBER = ROLE.MEMBER.value
GUEST = ROLE.GUEST.value


class ProjectPagePermission(BasePermission):
    """
    Custom permission to control access to pages within a workspace
    based on user roles, page visibility (public/private), and feature flags.
    """

    def has_permission(self, request, view):
        """
        Check basic project-level permissions before checking object-level permissions.
        """
        if request.user.is_anonymous:
            return False

        user_id = request.user.id
        slug = view.kwargs.get("slug")
        page_id = view.kwargs.get("page_id")
        project_id = view.kwargs.get("project_id")

        # Hook for extended validation
        extended_access, role = self._check_access_and_get_role(request, slug, project_id)
        if extended_access is False:
            return False

        if page_id:
            page = Page.objects.get(id=page_id, workspace__slug=slug)

            # Allow access if the user is the owner of the page
            if page.owned_by_id == user_id:
                return True

            # Handle private page access
            if page.access == Page.PRIVATE_ACCESS:
                return self._has_private_page_action_access(request, slug, page, project_id)

        # Handle public page access
        return self._has_public_page_action_access(request, role)

    def _check_project_member_access(self, request, slug, project_id):
        """
        Check if the user is a project member.
        """
        return (
            ProjectMember.objects.filter(
                member=request.user,
                workspace__slug=slug,
                is_active=True,
                project_id=project_id,
            )
            .values_list("role", flat=True)
            .first()
        )

    def _check_access_and_get_role(self, request, slug, project_id):
        """
        Hook for extended access checking
        Returns: True (allow), False (deny), None (continue with normal flow)
        """
        role = self._check_project_member_access(request, slug, project_id)
        if not role:
            return False, None
        return True, role

    def _has_private_page_action_access(self, request, slug, page, project_id):
        """
        Check access to private pages. Override for feature flag logic.
        """
        # Base implementation: only owner can access private pages
        return False

    def _check_project_action_access(self, request, role):
        method = request.method

        # Only admins can create (POST) pages
        if method == "POST":
            if role in [ADMIN, MEMBER]:
                return True
            return False

        # Safe methods (GET, HEAD, OPTIONS) allowed for all active roles
        if method in SAFE_METHODS:
            if role in [ADMIN, MEMBER, GUEST]:
                return True
            return False

        # PUT/PATCH: Admins and members can update
        if method in ["PUT", "PATCH"]:
            if role in [ADMIN, MEMBER]:
                return True
            return False

        # DELETE: Only admins can delete
        if method == "DELETE":
            if role in [ADMIN]:
                return True
            return False

        # Deny by default
        return False

    def _has_public_page_action_access(self, request, role):
        """
        Check if the user has permission to access a public page
        and can perform operations on the page.
        """
        project_member_exists = self._check_project_action_access(request, role)
        if not project_member_exists:
            return False
        return True


class PageReactionPermission(BasePermission):
    """
    Category 10, feature 2 ("Reactions emoji sur les Pages") - gates the
    project-scoped page reactions endpoints on READ access to the
    underlying Page, regardless of the reaction endpoint's own HTTP verb.

    Adding/removing a reaction is a lightweight, read-gated interaction
    (spec exigence 1: "un utilisateur ayant un acces en lecture ... peut
    ajouter une reaction"), not a Page content edit - so this deliberately
    does NOT reuse `ProjectPagePermission._check_project_action_access`,
    whose POST/PUT/DELETE branches gate *writing to the Page itself*
    (only ADMIN/MEMBER may POST a new page, only ADMIN may DELETE one).
    Applying that verb-keyed logic here would wrongly block a GUEST or
    MEMBER from reacting (POST) or from removing their own reaction
    (DELETE), contradicting exigence 3/12 ("viewer peut reagir, guest
    limite selon la configuration existante des Pages").

    Instead this mirrors the two READ-access mechanisms that already
    govern whether a user can see a Page at all today:
      1. `ProjectPagePermission`'s own read branch: the page owner always
         passes; a PRIVATE page (`Page.PRIVATE_ACCESS`) denies every other
         user outright (no sharing mechanism exists for private pages in
         this fork); a PUBLIC page requires active project membership.
      2. The extra GUEST restriction applied inline in
         `PageViewSet.retrieve`/`list` (`apps/api/plane/app/views/page/
         base.py`): a GUEST who does not own the page can only see it if
         `project.guest_view_all_features` is set - this applies on top of
         (1), even for a PUBLIC page.

    Reactions on an archived page are allowed (archived is a read-only
    content state, not a deletion) and reactions on a locked page are
    allowed (locking blocks content edits only, per the spec's own
    exigence 9 reasoning) - neither `archived_at` nor `is_locked` is
    checked here. Reactions on a soft-deleted/trashed page are blocked for
    free: `Page.objects` (the default manager) already excludes
    soft-deleted rows, so a trashed page's id simply won't resolve below.
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        slug = view.kwargs.get("slug")
        project_id = view.kwargs.get("project_id")
        page_id = view.kwargs.get("page_id")

        role = (
            ProjectMember.objects.filter(
                member=request.user,
                workspace__slug=slug,
                is_active=True,
                project_id=project_id,
            )
            .values_list("role", flat=True)
            .first()
        )
        if not role:
            return False

        page = Page.objects.filter(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        ).first()
        if page is None:
            return False

        # Owner always has access, regardless of role or page.access.
        if page.owned_by_id == request.user.id:
            return True

        # PRIVATE pages: no sharing mechanism beyond ownership in this
        # fork - mirrors ProjectPagePermission._has_private_page_action_access.
        if page.access == Page.PRIVATE_ACCESS:
            return False

        # PUBLIC page: a restricted GUEST (guest_view_all_features off) can
        # only interact with pages they own - mirrors the extra check in
        # PageViewSet.retrieve()/list().
        if role == GUEST:
            project = Project.objects.filter(pk=project_id).only("guest_view_all_features").first()
            if project is not None and not project.guest_view_all_features:
                return False

        return role in (ADMIN, MEMBER, GUEST)
