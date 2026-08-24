# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 4 "Constructeur de roles personnalises" - the
permission resolution engine (spec's own "service
plane.db.services.rbac.PermissionResolver", implemented here as plain
functions rather than a model/class, matching the spec's own hedge "pas un
modele, mais a documenter comme dependance structurante") + its O(1) cache
(exigence 10) + the explicit (never signal-based, decision #2) sync/
invalidation helpers every real mutation call site uses.

Cache design (exigence 10/11): keyed per-ROLE (`rbac:role:<role_id>:
permissions`), not per-member - a member's effective permissions are
always resolved as "look up which role this member has (a plain FK/legacy
lookup, always cheap, never itself cached), then look up THAT role's
cached permission union". This means a `WorkspaceMember.custom_role`
change needs ZERO cache invalidation (the cached entry for role A and the
cached entry for role B are both still correct - only WHICH one a given
member maps to changed) - the only things that ever invalidate a role's
own cache entry are the 3 real call sites listed on
`invalidate_role_permissions_cache`'s own docstring. This is deliberately
NOT a TTL-based eventual-consistency cache (exigence 11 - "pas de
necessite de re-login", i.e. no stale-cache window is acceptable) - the
generous TTL below is a defensive backstop against a missed invalidation
call site, not the real correctness mechanism.
"""

from typing import Optional

from django.core.cache import cache
from django.core.exceptions import ValidationError

CACHE_KEY_TEMPLATE = "rbac:role:{role_id}:permissions"
# Defensive backstop only - see module docstring. Real correctness comes
# from the explicit `invalidate_role_permissions_cache` calls.
CACHE_TTL_SECONDS = 60 * 60 * 24


def _cache_key(role_id) -> str:
    return CACHE_KEY_TEMPLATE.format(role_id=role_id)


def invalidate_role_permissions_cache(role_id) -> None:
    """Explicit invalidation (decision #2 - no Django signal). Call this,
    synchronously, at every one of these real mutation call sites (the
    full list, matching this feature's own build report):

    1. `PermissionSchemeViewSet.partial_update` (a bundle's `items`
       replaced) - invalidate every role currently attached to that
       scheme via `WorkspaceRoleScheme`.
    2. `PermissionSchemeViewSet.destroy` - same set, defensive (deletion
       is blocked while attached, see `PermissionScheme`'s `PROTECT` FK,
       so this mostly guards a future relaxation of that rule).
    3. `RoleSchemesAttachEndpoint` (`POST .../roles/<id>/schemes/`) - THE
       real attach/detach call site - invalidate that one role.
    4. `WorkspaceRoleViewSet.destroy` - hygiene (the role is gone).

    Uses `cache.delete` (never `cache.clear()` - this fork's own repeated
    gotcha about accidentally flushing the real shared docker-compose
    Redis in a test/cleanup path).
    """
    cache.delete(_cache_key(role_id))


def _compute_role_permissions(role) -> dict:
    """Union of every attached scheme's items (exigence 3). Returns
    `{permission_key: [conditions...]}` - a JSON-safe (list, not set)
    shape suitable for direct `cache.set`. A permission present with
    `"NONE"` in its condition list is granted unconditionally - `"NONE"`
    is absorbing (if ANY attached scheme grants a permission
    unconditionally, the union is unconditional, regardless of what any
    OTHER scheme says about the same permission) since union semantics
    can only ever ADD access, never narrow it.
    """
    from plane.db.models import PermissionSchemeItem, WorkspaceRoleScheme

    scheme_ids = list(WorkspaceRoleScheme.objects.filter(role_id=role.id).values_list("scheme_id", flat=True))
    if not scheme_ids:
        return {}

    result: dict = {}
    items = PermissionSchemeItem.objects.filter(scheme_id__in=scheme_ids).select_related("permission")
    for item in items:
        key = item.permission.key
        conditions = result.setdefault(key, set())
        conditions.add(item.condition)
    return {key: sorted(conditions) for key, conditions in result.items()}


def get_role_permissions(role_id) -> dict:
    """Cached union lookup - the O(1)-amortized read path (exigence 10)."""
    from plane.db.models import WorkspaceRole

    key = _cache_key(role_id)
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        role = WorkspaceRole.objects.get(id=role_id)
    except WorkspaceRole.DoesNotExist:
        return {}

    computed = _compute_role_permissions(role)
    cache.set(key, computed, timeout=CACHE_TTL_SECONDS)
    return computed


def resolve_effective_role(member):
    """A `WorkspaceMember` with `custom_role` set uses it directly.
    Otherwise (any WorkspaceMember creation call site this feature did
    NOT wire to set `custom_role` eagerly - bot creation, SCIM
    provisioning, god-mode workspace creation, ordinary invite-accept -
    see this feature's own build report for the documented list) falls
    back to the workspace's own system role matching the plain legacy
    `role` integer - this is a read-only, never-persisted fallback, so
    every member is resolved correctly from the moment the 3 system roles
    exist for their workspace, with zero write needed for untouched
    creation paths.
    """
    from plane.db.models import WorkspaceRole

    if member.custom_role_id:
        return member.custom_role

    return WorkspaceRole.objects.filter(
        workspace_id=member.workspace_id, is_system=True, legacy_role_value=member.role
    ).first()


def _iter_candidate_projects(resource):
    """Duck-typed parent-project resolution, shared by every one of the 5
    in-scope domains despite their different real shapes: Issue/Cycle/
    Module (`ProjectBaseModel`) have a required singular `project` FK;
    `IssueView` (`WorkspaceBaseModel`) has a NULLABLE singular `project`
    FK (a workspace-scoped view has none); `Page` has an M2M `projects`
    (a workspace-scoped Wiki page can have zero, a project page usually
    has exactly one, nothing stops more). PROJECT_LEAD_ONLY evaluates true
    if the acting user leads ANY resolved project - for a resource with no
    project at all this always evaluates False (a real, intentional
    "condition not satisfied", never an error - the error case is instead
    a whole PERMISSION category having no project relationship at all,
    rejected at configuration time by `validate_scheme_item_condition`,
    not here).
    """
    project = getattr(resource, "project", None)
    if project is not None:
        yield project
        return

    projects_manager = getattr(resource, "projects", None)
    if projects_manager is not None and hasattr(projects_manager, "all"):
        yield from projects_manager.all()


def _is_project_lead(resource, user) -> bool:
    for project in _iter_candidate_projects(resource):
        if project is not None and project.project_lead_id == user.id:
            return True
    return False


def has_permission(user, workspace_slug: str, permission_key: str, resource=None) -> bool:
    """The real evaluation entrypoint. Does NOT special-case the
    workspace Owner - by decision #1, Owner bypass is handled entirely by
    the pre-existing, independent `IsWorkspaceOwner`/`is_workspace_owner`
    (category 11 features 3+5), always checked ALONGSIDE this function by
    the caller, never inside it, so this module never has to know about
    ownership at all.
    """
    from plane.db.models import WorkspaceMember

    if user is None or user.is_anonymous:
        return False

    member = (
        WorkspaceMember.objects.filter(workspace__slug=workspace_slug, member=user, is_active=True)
        .select_related("custom_role")
        .first()
    )
    if member is None:
        return False

    role = resolve_effective_role(member)
    if role is None:
        return False

    permissions = get_role_permissions(role.id)
    conditions = permissions.get(permission_key)
    if not conditions:
        return False

    if "NONE" in conditions:
        return True

    if resource is None:
        # No resource to evaluate CREATOR_ONLY/PROJECT_LEAD_ONLY against -
        # fail closed (only an unconditional NONE grant, handled above,
        # can authorize a resource-less check).
        return False

    if "CREATOR_ONLY" in conditions and getattr(resource, "created_by_id", None) == user.id:
        return True

    if "PROJECT_LEAD_ONLY" in conditions and _is_project_lead(resource, user):
        return True

    return False


def validate_scheme_item_condition(permission, condition: str) -> None:
    """Exigence 8 - reject at WRITE time (called from
    `plane.app.serializers.rbac.PermissionSchemeItemInputSerializer.
    validate`), never silently ignored at evaluation time. Covers both
    halves of exigence 8 by construction: a condition not in the
    permission's own `supported_conditions` is rejected whether that's
    because the condition is nonsensical for the ACTION (e.g.
    `CREATOR_ONLY` on a `*.create` permission - nothing exists yet to
    check a creator against) or because the permission's DOMAIN has no
    genuine parent project at all (every `WORKSPACE`-category permission's
    `supported_conditions` never includes `PROJECT_LEAD_ONLY` - see the
    data migration's own catalogue for the full per-permission list).
    """
    supported = permission.supported_conditions or []
    if condition not in supported:
        raise ValidationError(
            f"Permission '{permission.key}' does not support condition '{condition}' "
            f"(supported: {', '.join(supported) or 'NONE only'})."
        )


def sync_member_role_fields(member, *, role: Optional[int] = None, custom_role=None) -> None:
    """Keeps `WorkspaceMember.role` (legacy int) and `.custom_role` (FK)
    coherent, in-memory (caller still has to `.save()`) - the SINGLE-PATCH
    half of decision #5's sync requirement (the real call site is
    `WorkSpaceMemberViewSet.partial_update`). Raises `ValidationError` on
    a genuinely inconsistent explicit combination (both passed, and they
    disagree) rather than silently picking one.

    - Only `role` passed: legacy dropdown path - looks up this member's
      workspace's own system role matching that legacy value and sets
      BOTH fields (keeps `custom_role` from going stale/pointing at a
      role the member no longer really has).
    - Only `custom_role` passed: new custom-role-aware path - sets
      `custom_role` and derives `role` from `custom_role.legacy_role_value`.
    - Both passed: must agree (`role == custom_role.legacy_role_value`) or
      this raises - the view layer turns that into the spec's required
      400 ("l'API rejette une combinaison incoherente").
    """
    from plane.db.models import WorkspaceRole

    if role is None and custom_role is None:
        return

    if role is not None and custom_role is not None:
        if custom_role.legacy_role_value != int(role):
            raise ValidationError("`role` and `custom_role_id` are inconsistent for this member.")
        member.role = int(role)
        member.custom_role = custom_role
        return

    if custom_role is not None:
        member.custom_role = custom_role
        if custom_role.legacy_role_value is not None:
            member.role = custom_role.legacy_role_value
        return

    # Only `role` passed.
    member.role = int(role)
    matching_system_role = WorkspaceRole.objects.filter(
        workspace_id=member.workspace_id, is_system=True, legacy_role_value=int(role)
    ).first()
    member.custom_role = matching_system_role


def cascade_legacy_role_value_change(role) -> int:
    """The BULK half of decision #5's sync requirement: editing a
    (non-system) `WorkspaceRole.legacy_role_value` must not leave every
    `WorkspaceMember` currently holding that role with a now-stale plain
    `role` integer - a genuine `bulk_update()`-shaped write (same "bypasses
    everything that isn't an explicit call" bug class this fork's own
    features 3+5 already hit for `ProjectMember`), done here as a plain
    `.update()` QuerySet call, never a signal. Call this from
    `WorkspaceRoleViewSet.partial_update` immediately after
    `legacy_role_value` actually changes. Returns the number of members
    updated (used by the view to report back / by tests to assert the
    bulk path really ran).
    """
    from plane.db.models import WorkspaceMember

    if role.legacy_role_value is None:
        return 0
    return WorkspaceMember.objects.filter(custom_role_id=role.id).update(role=role.legacy_role_value)
