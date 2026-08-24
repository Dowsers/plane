# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 4 "Constructeur de roles personnalises" - the
LAST and most systemically invasive feature in this category.

Five new models implementing a composable RBAC layer on top of the 3 real
legacy role integers (Admin=20/Member=15/Guest=5) - see this initiative's
own pre-implementation research/decisions before touching any of this:

- "Owner" is NOT modeled as a 4th role value here (despite the spec's own
  "4 roles historiques" framing) - only 3 system `WorkspaceRole` rows are
  ever migrated/seeded (Admin/Member/Guest). Real ownership
  (`Workspace.owner` + the already-shipped `IsWorkspaceOwner` permission
  class, category 11 features 3+5) stays a fully independent, supreme
  mechanic that this new bundle system can never touch, override, or grant
  - `WorkspaceRole.is_owner_equivalent` below protects the system Admin
  role's OWN baseline permissions from being stripped (the spec's real
  anti-lockout intent), it does not model Owner as a role.
- v1 scope: only 5 domains (Issue/Cycle/Module/Page/View) get a real
  permission catalogue; every pre-existing inline legacy-role-integer
  comparison outside those domains (~25 found in real view code, e.g.
  "only admin can't leave project" checks) keeps reading the plain
  `WorkspaceMember.role` integer exactly as before - `WorkspaceRole.
  legacy_role_value` is what keeps that integer correct for members
  holding a role this new system manages. No per-project override, no
  ASSIGNEE_ONLY/REPORTER_ONLY conditions (only CREATOR_ONLY/
  PROJECT_LEAD_ONLY) - see docs/feature-specs/11-admin-security-sso.md's
  own "Hors perimetre" section for feature 4, matched exactly.
- No Django signals anywhere in this change (this fork's own established
  10+-category convention) - every mutation that needs cache invalidation
  or legacy-int sync is an explicit call at the real write call site, see
  `plane.utils.rbac` for the resolver/cache/sync helpers those call sites
  use.
"""

from django.db import models

from .base import BaseModel


class PermissionCategory(models.TextChoices):
    """Matches the 5 in-scope domains 1:1, plus WORKSPACE for the handful
    of permissions that exist only to (a) gate this feature's own
    management endpoints (`workspace.manage_roles`) and (b) give the
    anti-lockout guard (exigence 4) concrete, unconditional catalogue rows
    to protect on the system Admin role (`workspace.delete`, `workspace.
    manage_billing`, `workspace.manage_members`) - none of the 4 WORKSPACE
    permissions are consumed by any PRE-EXISTING view (those stay on their
    current fixed-role gates, per decision #6's "facturation/integrations/
    exports restent hors perimetre"), except `workspace.manage_roles`,
    which this feature's OWN new endpoints genuinely enforce at runtime.
    """

    ISSUE = "ISSUE"
    CYCLE = "CYCLE"
    MODULE = "MODULE"
    PAGE = "PAGE"
    VIEW = "VIEW"
    WORKSPACE = "WORKSPACE"


class PermissionConditionType(models.TextChoices):
    NONE = "NONE"
    CREATOR_ONLY = "CREATOR_ONLY"
    PROJECT_LEAD_ONLY = "PROJECT_LEAD_ONLY"


class Permission(BaseModel):
    """One atomic, real gating decision (exigence 1). Read-only catalogue -
    no create/update/delete endpoint exists for this model, it is seeded
    exclusively by the data migration
    (`0172_category11_rbac.py`/`plane.utils.rbac.PERMISSION_CATALOGUE`).
    Workspace-agnostic by design (no `workspace` FK) - the catalogue is
    the same for every workspace, only which permissions a given
    workspace's roles/bundles grant varies.
    """

    key = models.SlugField(max_length=64, unique=True)
    category = models.CharField(max_length=16, choices=PermissionCategory.choices, db_index=True)
    label = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # List of `PermissionConditionType` values this permission can be
    # configured with on a `PermissionSchemeItem` - always includes NONE.
    # Enforced at scheme-item write time by
    # `plane.utils.rbac.validate_scheme_item_condition` (exigence 8), never
    # silently ignored at evaluation time.
    supported_conditions = models.JSONField(default=list)

    class Meta:
        verbose_name = "Permission"
        verbose_name_plural = "Permissions"
        db_table = "rbac_permissions"
        ordering = ("category", "key")

    def __str__(self):
        return self.key


class PermissionScheme(BaseModel):
    """The "bundle" (exigence 2). `workspace=None` marks one of the 3
    global, shared system baseline bundles created ONCE by the data
    migration (one per system role - Admin/Member/Guest - reused by every
    workspace's own system `WorkspaceRole` rows via `WorkspaceRoleScheme`,
    rather than duplicating 3 identical rows per workspace) - see the data
    migration's own module docstring for why this is safe (attaching/
    detaching a shared scheme from one workspace's role only touches that
    workspace's `WorkspaceRoleScheme` row, never the scheme itself).
    A workspace-scoped (`workspace` set) custom bundle is created by an
    Owner/Admin via `POST /api/workspaces/<slug>/permission-schemes/` and
    can be attached to more than one of that workspace's roles.
    `is_system` bundles are read-only via the CRUD endpoint (can't PATCH
    their items or DELETE them) - only their ATTACHMENT to a role can be
    changed, and only for non-Guest roles (exigence 5) and never in a way
    that would violate the anti-lockout guard (exigence 4) for the
    Admin-equivalent role.
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        related_name="permission_schemes",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Permission Scheme"
        verbose_name_plural = "Permission Schemes"
        db_table = "rbac_permission_schemes"
        ordering = ("name",)

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"


class PermissionSchemeItem(BaseModel):
    """Through table (exigence 2/8). `condition` is only ever set to
    something other than NONE if `permission.supported_conditions` allows
    it - validated in the DRF serializer at write time
    (`plane.app.serializers.rbac.PermissionSchemeItemInputSerializer`,
    delegating to `plane.utils.rbac.validate_scheme_item_condition`), and
    defensively again here via `clean()` for any future non-HTTP caller
    (data migration, management shell) - `clean()` is deliberately NOT
    wired into an overridden `save()` (this fork's data migration uses
    `bulk_create`, which never calls `full_clean()`/`save()` per instance
    anyway; forcing it here would give a false sense of safety for that
    path while adding risk of breaking bulk paths that already validate
    their own seed data by construction).
    """

    scheme = models.ForeignKey(PermissionScheme, related_name="items", on_delete=models.CASCADE)
    permission = models.ForeignKey(Permission, related_name="scheme_items", on_delete=models.CASCADE)
    condition = models.CharField(
        max_length=32,
        choices=PermissionConditionType.choices,
        default=PermissionConditionType.NONE,
    )

    class Meta:
        verbose_name = "Permission Scheme Item"
        verbose_name_plural = "Permission Scheme Items"
        db_table = "rbac_permission_scheme_items"
        unique_together = ("scheme", "permission")
        ordering = ("permission__category", "permission__key")

    def clean(self):
        from django.core.exceptions import ValidationError as DjangoValidationError

        from plane.utils.rbac import validate_scheme_item_condition

        try:
            validate_scheme_item_condition(self.permission, self.condition)
        except DjangoValidationError:
            raise
        except Exception as exc:  # pragma: no cover - defensive
            raise DjangoValidationError(str(exc))

    def __str__(self):
        return f"{self.scheme_id}:{self.permission_id}={self.condition}"


class WorkspaceRole(BaseModel):
    """A named, workspace-scoped role (exigence 3). Effective permissions
    are the UNION of every attached `PermissionScheme`'s items - see
    `plane.utils.rbac.resolve_role_permissions` (this is a plain function/
    cache layer, not a model, per the spec's own "service
    PermissionResolver" framing).

    `is_system=True` marks the 3 migrated roles (Admin/Member/Guest) -
    never deletable, `is_system`/`is_owner_equivalent`/`legacy_role_value`
    are read-only for these via the CRUD serializer regardless of who's
    calling (exigence 4/6). `is_owner_equivalent=True` ONLY for the system
    Admin role - protects `PROTECTED_PERMISSION_KEYS` below from ever
    being left uncovered by the role's attached schemes (exigence 4); this
    is NOT a model of "Owner" as a role (see module docstring) - real
    ownership stays on `Workspace.owner`/`IsWorkspaceOwner`, fully
    independent of and supreme over anything this model can grant.

    `legacy_role_value` (20/15/5) is the anti-regression bridge (decision
    #5): every out-of-scope call site outside Issue/Cycle/Module/Page/View
    keeps reading `WorkspaceMember.role` (the plain integer) exactly as
    before - this field is what keeps that integer correct whenever a
    member's `custom_role` changes, via the explicit (never signal-based)
    sync helpers in `plane.utils.rbac`.
    """

    # The 3 permissions the spec's own anti-lockout guard (exigence 4)
    # names literally - never strippable from the system Admin role's
    # attached-schemes union (checked at `POST .../roles/<id>/schemes/`
    # write time, not just documented).
    PROTECTED_PERMISSION_KEYS = (
        "workspace.delete",
        "workspace.manage_billing",
        "workspace.manage_members",
    )
    LEGACY_ROLE_VALUES = (20, 15, 5)
    LEGACY_GUEST_VALUE = 5

    workspace = models.ForeignKey("db.Workspace", related_name="rbac_roles", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)
    legacy_role_value = models.IntegerField(null=True, blank=True)
    is_owner_equivalent = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Workspace Role"
        verbose_name_plural = "Workspace Roles"
        db_table = "rbac_workspace_roles"
        ordering = ("-is_system", "name")

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"


class WorkspaceRoleScheme(BaseModel):
    """Through table attaching bundles to a role (exigence 2/3). The only
    real "compose a role" write surface -
    `POST /api/workspaces/<slug>/roles/<role_id>/schemes/`
    (`plane.app.views.rbac.RoleSchemesAttachEndpoint`), which is also
    where the anti-lockout guard (system Admin role) and the
    non-customizable-Guest guard (exigence 5) are enforced, and the ONE
    real explicit cache-invalidation call site for `WorkspaceRoleScheme`
    changes (decision #2 - no signal).
    """

    role = models.ForeignKey(WorkspaceRole, related_name="scheme_links", on_delete=models.CASCADE)
    scheme = models.ForeignKey(PermissionScheme, related_name="role_links", on_delete=models.PROTECT)

    class Meta:
        verbose_name = "Workspace Role Scheme"
        verbose_name_plural = "Workspace Role Schemes"
        db_table = "rbac_workspace_role_schemes"
        unique_together = ("role", "scheme")

    def __str__(self):
        return f"{self.role_id} -> {self.scheme_id}"
