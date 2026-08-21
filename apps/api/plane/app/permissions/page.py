# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import ProjectMember, Page, Project, WorkspaceMember
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


class WorkspacePagePermission(BasePermission):
    """
    Category 10, feature 4 ("Wiki workspace en GA") - permission for the
    new workspace-scoped Page endpoints (`is_global=True` pages with no
    project link: `plane.app.views.page.workspace.WorkspacePageViewSet`
    and friends).

    Mirrors `ProjectPagePermission`'s own role-gating shape (owner always
    allowed; a PRIVATE page denies every non-owner, exigence 8; a PUBLIC
    page is readable by any active member and writable by ADMIN/MEMBER,
    deletable by ADMIN only) but checks `WorkspaceMember` instead of
    `ProjectMember` - a workspace Page has no project to scope a role
    check against by definition. There is no GUEST
    `guest_view_all_features`-style extra restriction here (that flag is
    a `Project` field with no workspace-level equivalent) - a GUEST simply
    follows the same public/private `access` rule as everyone else
    (exigence 4/8's own wording: "Guest ... respecte les memes regles de
    role que le reste du workspace").

    The "root creation restricted to `wiki_root_creation_role`" rule
    (exigence 4) is deliberately NOT enforced here - it only applies when
    creating at the WIKI ROOT (no `collection_id`), which this
    object-agnostic `has_permission` hook can't distinguish from
    "creating inside a Collection" without inspecting the request body;
    that check lives inline in `WorkspacePageViewSet.create`/
    `WorkspacePageCollectionViewSet.create` instead.

    Deliberately does NOT filter the `page_id` lookup on `is_global=True`
    the way `WorkspacePagePermission`'s sibling classes elsewhere in this
    module do: `WorkspacePageViewSet.convert` is reachable through this
    same workspace-scoped URL for the project->global direction too, at
    which point the page is *still* a project-scoped page
    (`is_global=False`) at request time - gating on `is_global=True` here
    would 403 that direction outright. Each individual view method (not
    this permission class) is responsible for re-filtering `is_global`
    appropriately for its own action - `convert` is the sole exception
    that intentionally accepts either state.
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        slug = view.kwargs.get("slug")
        page_id = view.kwargs.get("page_id")

        role = (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .values_list("role", flat=True)
            .first()
        )
        if not role:
            return False

        if page_id:
            page = Page.objects.filter(pk=page_id, workspace__slug=slug).first()
            if page is None:
                return False

            # Owner always has access, regardless of role or page.access.
            if page.owned_by_id == request.user.id:
                return True

            if page.access == Page.PRIVATE_ACCESS:
                return False

        method = request.method
        if method == "POST":
            return role in (ADMIN, MEMBER)
        if method in SAFE_METHODS:
            return role in (ADMIN, MEMBER, GUEST)
        if method in ("PUT", "PATCH"):
            return role in (ADMIN, MEMBER)
        if method == "DELETE":
            return role == ADMIN
        return False


class WorkspacePageReactionPermission(BasePermission):
    """
    Workspace-scope counterpart to `PageReactionPermission` (category 10,
    feature 2/4) - gates the workspace-level page reactions endpoints on
    READ access to the underlying Page only, same reasoning as that
    class's own docstring: reacting is a lightweight, read-gated
    interaction, not a Page content edit, so it deliberately does not
    reuse `WorkspacePagePermission`'s verb-keyed write gating (which would
    wrongly block a GUEST from reacting/un-reacting).
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        slug = view.kwargs.get("slug")
        page_id = view.kwargs.get("page_id")

        role = (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .values_list("role", flat=True)
            .first()
        )
        if not role:
            return False

        page = Page.objects.filter(pk=page_id, workspace__slug=slug, is_global=True).first()
        if page is None:
            return False

        if page.owned_by_id == request.user.id:
            return True

        if page.access == Page.PRIVATE_ACCESS:
            return False

        return role in (ADMIN, MEMBER, GUEST)


class PageCommentPermission(BasePermission):
    """
    Category 10, features 1+3 (merged, "Commentaires ancres sur les
    Pages" + "Resolution de fils de commentaires") - project-scoped.

    Read access (GET) mirrors `PageReactionPermission` exactly: the same
    owner/private/public-with-guest-view-all-features rule that already
    governs whether a user can see a Page at all, applied here to reading
    its comment threads (decision #5 of this feature's build brief: "a
    Guest can READ comment threads ... if they can already read the
    Page").

    Writes (POST/PATCH/DELETE - create a root thread, add a reply, edit
    own text, soft-delete, resolve, reopen) additionally require the
    caller's role to be ADMIN or MEMBER - a GUEST is unconditionally
    excluded from every write action here, regardless of `page.access` or
    `guest_view_all_features` (decision #5: "ne peut jamais creer un
    commentaire racine, une reponse, resoudre, ou reouvrir un fil ...
    contrairement au libelle plus permissif de l'exigence 3 de la feature
    1"). This permission class only enforces the coarse role/read-access
    gate; the finer per-object checks (author-only edit; author/owner/
    admin delete and resolve/reopen, via
    `plane.utils.page_comment.can_user_moderate_page_comment_thread`; the
    locked/archived write block, via
    `plane.utils.page_comment.page_comment_write_block_reason`) are all
    enforced inline in the view methods themselves, the same way
    `ProjectPagePermission`'s own object-level owner/private checks are
    layered on top of its role gate.
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

        has_read_access = True
        if page.owned_by_id != request.user.id:
            if page.access == Page.PRIVATE_ACCESS:
                has_read_access = False
            elif role == GUEST:
                project = Project.objects.filter(pk=project_id).only("guest_view_all_features").first()
                if project is not None and not project.guest_view_all_features:
                    has_read_access = False

        if not has_read_access:
            return False

        if request.method in SAFE_METHODS:
            return True

        return role in (ADMIN, MEMBER)


class WorkspacePageCommentPermission(BasePermission):
    """
    Workspace-scope counterpart to `PageCommentPermission` (category 10,
    features 1+3, wired to the Wiki GA workspace-scoped Page endpoints -
    feature 4). Same read/write split, checked against `WorkspaceMember`
    instead of `ProjectMember` - no `guest_view_all_features`-style extra
    restriction here, same reasoning as `WorkspacePagePermission` above (a
    workspace Page has no project to carry that flag on).
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        slug = view.kwargs.get("slug")
        page_id = view.kwargs.get("page_id")

        role = (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .values_list("role", flat=True)
            .first()
        )
        if not role:
            return False

        page = Page.objects.filter(pk=page_id, workspace__slug=slug, is_global=True).first()
        if page is None:
            return False

        has_read_access = True
        if page.owned_by_id != request.user.id and page.access == Page.PRIVATE_ACCESS:
            has_read_access = False

        if not has_read_access:
            return False

        if request.method in SAFE_METHODS:
            return True

        return role in (ADMIN, MEMBER)


class PageCommentReactionPermission(BasePermission):
    """
    Category 10, features 1+3 - gates the project-scoped page COMMENT
    reactions endpoints on READ access to the underlying Page, mirroring
    `PageReactionPermission` exactly (including allowing GUEST for both
    read and write here): reacting to a comment is the same lightweight,
    read-gated interaction as reacting to a Page, not a moderation action -
    decision #5 of this feature's build brief only names root-comment/
    reply/resolve/reopen as GUEST-blocked, reactions are not in that list.
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

        if page.owned_by_id == request.user.id:
            return True

        if page.access == Page.PRIVATE_ACCESS:
            return False

        if role == GUEST:
            project = Project.objects.filter(pk=project_id).only("guest_view_all_features").first()
            if project is not None and not project.guest_view_all_features:
                return False

        return role in (ADMIN, MEMBER, GUEST)


class WorkspacePageCommentReactionPermission(BasePermission):
    """Workspace-scope counterpart to `PageCommentReactionPermission`,
    mirroring `WorkspacePageReactionPermission` exactly.
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        slug = view.kwargs.get("slug")
        page_id = view.kwargs.get("page_id")

        role = (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .values_list("role", flat=True)
            .first()
        )
        if not role:
            return False

        page = Page.objects.filter(pk=page_id, workspace__slug=slug, is_global=True).first()
        if page is None:
            return False

        if page.owned_by_id == request.user.id:
            return True

        if page.access == Page.PRIVATE_ACCESS:
            return False

        return role in (ADMIN, MEMBER, GUEST)
