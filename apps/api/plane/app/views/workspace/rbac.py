# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 4 - "Constructeur de roles personnalises".
Endpoints: `GET /permissions/`, `GET|POST /permission-schemes/`,
`GET|PATCH|DELETE /permission-schemes/<id>/`, `GET|POST /roles/`,
`GET|PATCH|DELETE /roles/<id>/`, `POST /roles/<id>/schemes/`,
`GET /roles/<id>/members/`.

Every endpoint here is gated by `WorkspaceManageRolesPermission`
(workspace.manage_roles OR the independent, supreme Owner bypass) - a
deliberately conservative, unqualified reading of this feature's own
"Restricted to members with the workspace:manage_roles permission - 403
otherwise" instruction: even the read-only catalogue/list endpoints are
gated, not just the mutating ones, matching this feature's own
"dedicated security review before merge" framing (better to under-expose
this genuinely sensitive management surface than over-expose it) - a
future, separate personal "my effective permissions" summary endpoint
(spec's own user story 5, explicitly frontend/out-of-scope for this
backend task) would need its own, more permissive, read-only surface,
not a relaxation of this one.
"""

from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import WorkspaceManageRolesPermission, WorkspaceViewerPermission
from plane.app.serializers import (
    PermissionSchemeItemInputSerializer,
    PermissionSchemeSerializer,
    PermissionSerializer,
    WorkSpaceMemberSerializer,
    WorkspaceRoleSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import (
    AuditEventType,
    Permission,
    PermissionCategory,
    PermissionScheme,
    PermissionSchemeItem,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
    WorkspaceRoleScheme,
)
from plane.utils.audit_log import log_audit_event
from plane.utils.rbac import (
    cascade_legacy_role_value_change,
    get_role_permissions,
    invalidate_role_permissions_cache,
    resolve_effective_role,
)


class PermissionCatalogueEndpoint(BaseAPIView):
    """GET /api/workspaces/<slug>/permissions/ - read-only, grouped by
    category (exigence 1). Same catalogue for every workspace (`Permission`
    has no `workspace` FK) - `slug` is only used for the permission check.
    """

    permission_classes = [WorkspaceManageRolesPermission]

    def get(self, request, slug):
        grouped = {category: [] for category, _ in PermissionCategory.choices}
        for permission in Permission.objects.all().order_by("category", "key"):
            grouped.setdefault(permission.category, []).append(PermissionSerializer(permission).data)
        return Response(grouped, status=status.HTTP_200_OK)


class PermissionSchemeViewSet(BaseViewSet):
    serializer_class = PermissionSchemeSerializer
    model = PermissionScheme
    permission_classes = [WorkspaceManageRolesPermission]

    def get_queryset(self):
        slug = self.kwargs.get("slug")
        return (
            PermissionScheme.objects.filter(Q(workspace__slug=slug) | Q(workspace__isnull=True))
            .distinct()
            .order_by("name")
        )

    def _validate_items_payload(self, raw_items):
        """Returns `(permission_by_id_and_condition, error_response)` -
        validates every line (exigence 8) BEFORE any DB write happens."""
        validated = []
        for raw_item in raw_items or []:
            item_serializer = PermissionSchemeItemInputSerializer(data=raw_item)
            if not item_serializer.is_valid():
                return None, Response(item_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            validated.append(item_serializer.validated_data)
        return validated, None

    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        name = request.data.get("name")
        if not name:
            return Response({"error": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        validated_items, error = self._validate_items_payload(request.data.get("items"))
        if error is not None:
            return error

        with transaction.atomic():
            scheme = PermissionScheme.objects.create(
                workspace=workspace,
                name=name,
                description=request.data.get("description", ""),
                is_system=False,
            )
            PermissionSchemeItem.objects.bulk_create(
                [
                    PermissionSchemeItem(
                        scheme=scheme, permission=item["permission"], condition=item["condition"]
                    )
                    for item in validated_items
                ]
            )

        return Response(PermissionSchemeSerializer(scheme).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, pk):
        scheme = self.get_queryset().get(pk=pk)
        if scheme.is_system or scheme.workspace_id is None:
            return Response(
                {"error": "A system permission bundle is read-only."}, status=status.HTTP_400_BAD_REQUEST
            )

        items_provided = "items" in request.data
        validated_items = None
        if items_provided:
            validated_items, error = self._validate_items_payload(request.data.get("items"))
            if error is not None:
                return error

        old_value = PermissionSchemeSerializer(scheme).data

        affected_role_ids = list(
            WorkspaceRoleScheme.objects.filter(scheme=scheme).values_list("role_id", flat=True)
        )

        with transaction.atomic():
            if "name" in request.data:
                scheme.name = request.data["name"]
            if "description" in request.data:
                scheme.description = request.data["description"]
            scheme.save()

            if items_provided:
                # Full-replace semantics (exigence 2's "un selecteur de
                # condition par ligne" UX sends the whole desired table
                # back on every save) - simplest correct diff: delete
                # everything, recreate from the validated payload, inside
                # the same transaction as the scalar-field save above.
                PermissionSchemeItem.objects.filter(scheme=scheme).delete()
                PermissionSchemeItem.objects.bulk_create(
                    [
                        PermissionSchemeItem(
                            scheme=scheme, permission=item["permission"], condition=item["condition"]
                        )
                        for item in validated_items
                    ]
                )

        if items_provided and affected_role_ids:
            for role_id in affected_role_ids:
                invalidate_role_permissions_cache(role_id)

        log_audit_event(
            AuditEventType.ROLE_DEFINITION_CHANGED,
            request=request,
            workspace=scheme.workspace,
            actor=request.user,
            target_type="PermissionScheme",
            target_id=str(scheme.id),
            old_value=old_value,
            new_value=PermissionSchemeSerializer(scheme).data,
        )

        return Response(PermissionSchemeSerializer(scheme).data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, pk):
        scheme = self.get_queryset().get(pk=pk)
        if scheme.is_system or scheme.workspace_id is None:
            return Response(
                {"error": "A system permission bundle cannot be deleted."}, status=status.HTTP_400_BAD_REQUEST
            )

        affected_role_ids = list(
            WorkspaceRoleScheme.objects.filter(scheme=scheme).values_list("role_id", flat=True)
        )
        if affected_role_ids:
            return Response(
                {
                    "error": "This bundle is attached to one or more roles and cannot be deleted.",
                    "role_count": len(affected_role_ids),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        log_audit_event(
            AuditEventType.ROLE_DEFINITION_CHANGED,
            request=request,
            workspace=scheme.workspace,
            actor=request.user,
            target_type="PermissionScheme",
            target_id=str(scheme.id),
            old_value=PermissionSchemeSerializer(scheme).data,
            new_value=None,
        )
        scheme.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceRoleViewSet(BaseViewSet):
    serializer_class = WorkspaceRoleSerializer
    model = WorkspaceRole
    permission_classes = [WorkspaceManageRolesPermission]

    def get_queryset(self):
        return WorkspaceRole.objects.filter(workspace__slug=self.kwargs.get("slug"))

    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        name = request.data.get("name")
        if not name:
            return Response({"error": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        legacy_role_value = request.data.get("legacy_role_value")
        try:
            legacy_role_value = int(legacy_role_value)
        except (TypeError, ValueError):
            legacy_role_value = None
        if legacy_role_value not in WorkspaceRole.LEGACY_ROLE_VALUES:
            return Response(
                {
                    "error": "legacy_role_value is required for a new role and must be one of "
                    f"{WorkspaceRole.LEGACY_ROLE_VALUES} (decision #5 - keeps every out-of-scope, "
                    "legacy-role-integer call site correct for members holding this role)."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = WorkspaceRole.objects.create(
            workspace=workspace,
            name=name,
            description=request.data.get("description", ""),
            is_system=False,
            is_owner_equivalent=False,
            legacy_role_value=legacy_role_value,
        )
        log_audit_event(
            AuditEventType.ROLE_DEFINITION_CHANGED,
            request=request,
            workspace=workspace,
            actor=request.user,
            target_type="WorkspaceRole",
            target_id=str(role.id),
            old_value=None,
            new_value=WorkspaceRoleSerializer(role).data,
        )
        return Response(WorkspaceRoleSerializer(role).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, pk):
        role = self.get_queryset().get(pk=pk)

        locked_fields_for_system_roles = ("is_system", "is_owner_equivalent", "legacy_role_value")
        if role.is_system:
            for field_name in locked_fields_for_system_roles:
                if field_name in request.data:
                    return Response(
                        {"error": f"'{field_name}' is read-only for a system role."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        else:
            for field_name in ("is_system", "is_owner_equivalent"):
                if field_name in request.data:
                    return Response(
                        {"error": f"'{field_name}' cannot be set directly."}, status=status.HTTP_400_BAD_REQUEST
                    )

        old_legacy_value = role.legacy_role_value
        old_value = WorkspaceRoleSerializer(role).data

        new_legacy_value = old_legacy_value
        if "legacy_role_value" in request.data and not role.is_system:
            try:
                new_legacy_value = int(request.data["legacy_role_value"])
            except (TypeError, ValueError):
                new_legacy_value = None
            if new_legacy_value not in WorkspaceRole.LEGACY_ROLE_VALUES:
                return Response(
                    {"error": f"legacy_role_value must be one of {WorkspaceRole.LEGACY_ROLE_VALUES}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if "name" in request.data:
            role.name = request.data["name"]
        if "description" in request.data:
            role.description = request.data["description"]
        role.legacy_role_value = new_legacy_value
        role.save()

        cascaded_member_count = 0
        if new_legacy_value != old_legacy_value:
            # The BULK half of decision #5's sync requirement - see
            # `cascade_legacy_role_value_change`'s own docstring.
            cascaded_member_count = cascade_legacy_role_value_change(role)

        log_audit_event(
            AuditEventType.ROLE_DEFINITION_CHANGED,
            request=request,
            workspace=role.workspace,
            actor=request.user,
            target_type="WorkspaceRole",
            target_id=str(role.id),
            old_value=old_value,
            new_value=WorkspaceRoleSerializer(role).data,
            metadata={"cascaded_member_count": cascaded_member_count} if cascaded_member_count else {},
        )
        return Response(WorkspaceRoleSerializer(role).data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, pk):
        role = self.get_queryset().get(pk=pk)
        if role.is_system:
            return Response({"error": "A system role cannot be deleted."}, status=status.HTTP_400_BAD_REQUEST)

        member_count = WorkspaceMember.objects.filter(custom_role=role).count()
        if member_count:
            return Response(
                {
                    "error": "This role is held by one or more members and cannot be deleted. "
                    "Reassign them to a different role first.",
                    "member_count": member_count,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        log_audit_event(
            AuditEventType.ROLE_DEFINITION_CHANGED,
            request=request,
            workspace=role.workspace,
            actor=request.user,
            target_type="WorkspaceRole",
            target_id=str(role.id),
            old_value=WorkspaceRoleSerializer(role).data,
            new_value=None,
        )
        invalidate_role_permissions_cache(role.id)
        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoleSchemesAttachEndpoint(BaseAPIView):
    """POST /api/workspaces/<slug>/roles/<role_id>/schemes/ - atomic
    attach/detach (exigence 2/3): `{"scheme_ids": [...]}` replaces the
    role's ENTIRE attached-schemes set. Enforces exigence 5 (Guest stays
    non-customizable) and exigence 4 (anti-lockout on the system Admin
    role) as real 400s, not just an unexposed UI - and is the ONE real
    `WorkspaceRoleScheme` mutation call site, so the ONE real place that
    invalidates that role's permission cache for this kind of change
    (decision #2).
    """

    permission_classes = [WorkspaceManageRolesPermission]

    def post(self, request, slug, role_id):
        role = WorkspaceRole.objects.get(pk=role_id, workspace__slug=slug)

        if role.is_system and role.legacy_role_value == WorkspaceRole.LEGACY_GUEST_VALUE:
            return Response(
                {"error": "The Guest role cannot be customized (exigence 5)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scheme_ids = request.data.get("scheme_ids")
        if not isinstance(scheme_ids, list):
            return Response({"error": "scheme_ids (a list) is required."}, status=status.HTTP_400_BAD_REQUEST)

        schemes = list(
            PermissionScheme.objects.filter(id__in=scheme_ids).filter(
                Q(workspace__slug=slug) | Q(workspace__isnull=True)
            )
        )
        if len(schemes) != len(set(scheme_ids)):
            return Response(
                {"error": "One or more scheme_ids do not exist or are not accessible to this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if role.is_owner_equivalent:
            missing = self._missing_protected_permissions(schemes)
            if missing:
                return Response(
                    {
                        "error": "This change would strip a protected permission from the "
                        "Admin-equivalent role (exigence 4) - rejected.",
                        "missing_permissions": missing,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        old_scheme_ids = list(WorkspaceRoleScheme.objects.filter(role=role).values_list("scheme_id", flat=True))

        with transaction.atomic():
            WorkspaceRoleScheme.objects.filter(role=role).delete()
            WorkspaceRoleScheme.objects.bulk_create(
                [WorkspaceRoleScheme(role=role, scheme=scheme) for scheme in schemes]
            )

        invalidate_role_permissions_cache(role.id)

        log_audit_event(
            AuditEventType.ROLE_DEFINITION_CHANGED,
            request=request,
            workspace=role.workspace,
            actor=request.user,
            target_type="WorkspaceRole",
            target_id=str(role.id),
            old_value={"scheme_ids": [str(sid) for sid in old_scheme_ids]},
            new_value={"scheme_ids": [str(s.id) for s in schemes]},
        )

        return Response(WorkspaceRoleSerializer(role).data, status=status.HTTP_200_OK)

    @staticmethod
    def _missing_protected_permissions(schemes):
        """Simulates the resulting union (exigence 4) WITHOUT touching
        the DB/cache - a scheme's items are read directly, not via
        `get_role_permissions` (which would read the OLD, not-yet-applied
        attachment)."""
        granted_unconditionally = set()
        items = PermissionSchemeItem.objects.filter(scheme__in=schemes).select_related("permission")
        for item in items:
            if item.condition == "NONE":
                granted_unconditionally.add(item.permission.key)
        return [key for key in WorkspaceRole.PROTECTED_PERMISSION_KEYS if key not in granted_unconditionally]


class RoleMembersEndpoint(BaseAPIView):
    """GET /api/workspaces/<slug>/roles/<role_id>/members/ - members
    holding this role (exigence 7's reassignment-before-delete UX)."""

    permission_classes = [WorkspaceManageRolesPermission]

    def get(self, request, slug, role_id):
        role = WorkspaceRole.objects.get(pk=role_id, workspace__slug=slug)
        members = WorkspaceMember.objects.filter(custom_role=role).select_related(
            "member", "member__avatar_asset"
        )
        serializer = WorkSpaceMemberSerializer(members, fields=("id", "member", "role"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MyEffectivePermissionsEndpoint(BaseAPIView):
    """GET /api/workspaces/<slug>/my-permissions/ - the requesting user's
    OWN resolved effective permissions in this workspace (spec's own user
    story 5 - "Mes permissions" in personal settings).

    Deliberately gated by the plain `WorkspaceViewerPermission` (any
    active member of this workspace, any role) rather than
    `WorkspaceManageRolesPermission` - every other endpoint in this module
    is a management surface reserved to `workspace.manage_roles`/Owner
    (see this module's own docstring), but this one is explicitly a
    self-service, read-your-own-data surface: it can only ever return the
    CALLING user's own permissions (there is no `member_id` parameter to
    read someone else's), so it carries none of that management-surface
    risk. The backend build for this feature (commit 8da6214f0)
    deliberately deferred this exact endpoint to the frontend pass ("a
    future, separate personal 'my effective permissions' summary endpoint
    ... would need its own, more permissive, read-only surface, not a
    relaxation of this one") - added here, now, because the frontend
    "My permissions" panel (category 11 feature 4 frontend) cannot
    function for a plain Member/Guest without it.
    """

    permission_classes = [WorkspaceViewerPermission]

    def get(self, request, slug):
        member = WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, is_active=True
        ).select_related("custom_role").first()
        if member is None:
            return Response({"error": "Not a member of this workspace."}, status=status.HTTP_403_FORBIDDEN)

        role = resolve_effective_role(member)
        if role is None:
            return Response(
                {"role": None, "permissions": []},
                status=status.HTTP_200_OK,
            )

        permission_conditions = get_role_permissions(role.id)
        catalogue_by_key = {
            permission.key: permission
            for permission in Permission.objects.filter(key__in=permission_conditions.keys())
        }

        permissions = [
            {
                "key": key,
                "category": catalogue_by_key[key].category,
                "label": catalogue_by_key[key].label,
                "description": catalogue_by_key[key].description,
                "conditions": conditions,
            }
            for key, conditions in sorted(permission_conditions.items())
            if key in catalogue_by_key
        ]

        return Response(
            {
                "role": {"id": str(role.id), "name": role.name, "is_system": role.is_system},
                "permissions": permissions,
            },
            status=status.HTTP_200_OK,
        )
