# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.permissions import BasePermission, SAFE_METHODS

# Module imports
from plane.db.models import Workspace, WorkspaceMember


# Permission Mappings
Admin = 20
Member = 15
Guest = 5


# TODO: Move the below logic to python match - python v3.10
class WorkSpaceBasePermission(BasePermission):
    def has_permission(self, request, view):
        # allow anyone to create a workspace
        if request.user.is_anonymous:
            return False

        if request.method == "POST":
            return True

        ## Safe Methods
        if request.method in SAFE_METHODS:
            return True

        # allow only admins and owners to update the workspace settings
        if request.method in ["PUT", "PATCH"]:
            return WorkspaceMember.objects.filter(
                member=request.user,
                workspace__slug=view.workspace_slug,
                role__in=[Admin, Member],
                is_active=True,
            ).exists()

        # allow only owner to delete the workspace
        if request.method == "DELETE":
            return WorkspaceMember.objects.filter(
                member=request.user,
                workspace__slug=view.workspace_slug,
                role=Admin,
                is_active=True,
            ).exists()


class WorkspaceAdminOnlyPermission(BasePermission):
    """Renamed from `WorkspaceOwnerPermission` - category 11
    (docs/feature-specs/11-admin-security-sso.md in plane-selfhost),
    features 3+5, decision #4. Despite the old name, this class has
    ALWAYS checked `role == Admin (20)`, i.e. "any workspace Admin", never
    real ownership (`workspace.owner_id`) - confirmed by reading its own
    body and by a pre-existing code comment elsewhere in this codebase
    (`plane/api/views/rate_limit.py`) that already flagged this exact
    misnaming while relying on the Admin-checking behavior. Both of this
    class's only two real call sites (`plane/api/views/rate_limit.py`'s
    per-token rate-limit override, `plane/api/views/invite.py`'s public-API
    invite CRUD) were independently confirmed to actually WANT "any Admin"
    (rate_limit.py's own docstring says so explicitly; invite.py's behavior
    parity target - the equivalent app/ BFF viewset,
    `plane.app.views.workspace.invite.WorkspaceInvitationsViewset` - uses
    `WorkSpaceAdminPermission`, itself Admin-or-Member, i.e. also not
    Owner-exclusive) - so this rename preserves both sites' existing
    behavior exactly; nothing about what they actually check has changed.
    For a genuine Owner-exclusive check, use `IsWorkspaceOwner` below
    instead - do NOT repurpose this class for that.
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return WorkspaceMember.objects.filter(
            workspace__slug=view.workspace_slug, member=request.user, role=Admin
        ).exists()


class IsWorkspaceOwner(BasePermission):
    """Real ownership check - `request.user.id == workspace.owner_id` -
    category 11 (docs/feature-specs/11-admin-security-sso.md in
    plane-selfhost), features 3+5, decision #4. Use this (not the
    Admin-checking `WorkspaceAdminOnlyPermission` above) for every action
    the spec reserves to the Owner specifically: ownership transfer,
    workspace deletion, audit log read access, and the new Security
    settings tab. A non-Owner caller - including a workspace Admin - is
    rejected here; view code should surface this as HTTP 403 with an
    explicit message ("Only the workspace owner can perform this
    action.", exigence 16) rather than a generic permission-denied string.

    Some existing viewsets in this codebase gate actions via a per-method
    `@allow_permission(...)` decorator (role-level checks only) rather than
    DRF's `permission_classes`. For those call sites, use the plain
    `is_workspace_owner(user, slug)` function below directly instead of
    duplicating the ownership query ad hoc - it's the same check this
    class's `has_permission` delegates to.
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return is_workspace_owner(request.user, view.workspace_slug)


def is_workspace_owner(user, slug: str) -> bool:
    """Plain-function form of `IsWorkspaceOwner`'s check, for call sites
    that gate via the `@allow_permission(...)` decorator (role-level only)
    rather than DRF `permission_classes` and so can't just add
    `IsWorkspaceOwner` to a `permission_classes` list."""
    if user.is_anonymous:
        return False
    return Workspace.objects.filter(slug=slug, owner_id=user.id).exists()


class WorkSpaceAdminPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return WorkspaceMember.objects.filter(
            member=request.user,
            workspace__slug=view.workspace_slug,
            role__in=[Admin, Member],
            is_active=True,
        ).exists()


class WorkspaceEntityPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        ## Safe Methods -> Handle the filtering logic in queryset
        if request.method in SAFE_METHODS:
            return WorkspaceMember.objects.filter(
                workspace__slug=view.workspace_slug, member=request.user, is_active=True
            ).exists()

        return WorkspaceMember.objects.filter(
            member=request.user,
            workspace__slug=view.workspace_slug,
            role__in=[Admin, Member],
            is_active=True,
        ).exists()


class WorkspaceViewerPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return WorkspaceMember.objects.filter(
            member=request.user, workspace__slug=view.workspace_slug, is_active=True
        ).exists()


class WorkspaceUserPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return WorkspaceMember.objects.filter(
            member=request.user, workspace__slug=view.workspace_slug, is_active=True
        ).exists()
