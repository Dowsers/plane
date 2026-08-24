# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 4 - gates every new endpoint this feature adds
(permissions catalogue, permission-schemes, roles, role<->scheme
attachment, role members) behind the real `workspace.manage_roles`
permission, resolved via the new bundle-based engine itself rather than a
hardcoded legacy-role check - by design (exigence 6), a workspace Owner
could compose a completely different custom role and grant IT
`workspace.manage_roles` instead of Admin's baseline bundle, so this
permission class deliberately does NOT hardcode `role == ADMIN` the way
most of this fork's other `permission_classes` do.

Owner always bypasses (decision #1) via the already-shipped, independent
`is_workspace_owner` - checked first, before ever consulting the new
resolver, so an Owner is never at the mercy of their own role/bundle
configuration (a real anti-lockout property: an Owner who misconfigures
every role's schemes can always still fix it).
"""

from rest_framework.permissions import BasePermission

from plane.utils.rbac import has_permission as rbac_has_permission

from .workspace import is_workspace_owner


class WorkspaceManageRolesPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        slug = getattr(view, "workspace_slug", None) or view.kwargs.get("slug")
        if not slug:
            return False

        if is_workspace_owner(request.user, slug):
            return True

        return rbac_has_permission(request.user, slug, "workspace.manage_roles")
