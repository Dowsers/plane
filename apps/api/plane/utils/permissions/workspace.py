# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.permissions import BasePermission, SAFE_METHODS

# Module imports
from plane.db.models import WorkspaceMember


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
    features 3+5, decision #4. See the identical class in
    `plane.app.permissions.workspace` for the full investigation this
    rename is based on - this module is a literal duplicate of that one
    and this class's ONE real call site here (`plane/api/views/invite.py`)
    was confirmed to actually want "any Admin" (its equivalent app/ BFF
    viewset uses `WorkSpaceAdminPermission`, itself Admin-or-Member) -
    despite the old name, this has ALWAYS checked `role == Admin (20)`,
    never real ownership. A genuine Owner-exclusive permission class
    (`IsWorkspaceOwner`) was deliberately NOT added to this module - no
    call site reached from here needs it yet; see
    `plane.app.permissions.workspace.IsWorkspaceOwner` if that changes.
    """

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return WorkspaceMember.objects.filter(
            workspace__slug=view.workspace_slug, member=request.user, role=Admin
        ).exists()


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
