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

import uuid
from typing import Optional

from django.core.cache import cache
from django.core.exceptions import ValidationError

CACHE_KEY_TEMPLATE = "rbac:role:{role_id}:permissions:{version}"
VERSION_KEY_TEMPLATE = "rbac:role:{role_id}:version"
# Defensive backstop only - see module docstring. Real correctness comes
# from the explicit `invalidate_role_permissions_cache` calls.
CACHE_TTL_SECONDS = 60 * 60 * 24


def _version_key(role_id) -> str:
    return VERSION_KEY_TEMPLATE.format(role_id=role_id)


def _current_version(role_id) -> str:
    """Category 11 feature 4 security-review fix (Finding 4) - a random
    opaque token, NOT an incrementing counter (`cache.incr` requires the
    key to already exist, which would need its own race-prone
    get-or-create dance) identifying the CURRENT "generation" of a role's
    cached permissions. Seeded lazily on first read.
    """
    key = _version_key(role_id)
    version = cache.get(key)
    if version is None:
        version = uuid.uuid4().hex
        cache.set(key, version, timeout=CACHE_TTL_SECONDS)
    return version


def _cache_key(role_id, version) -> str:
    return CACHE_KEY_TEMPLATE.format(role_id=role_id, version=version)


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

    Category 11 feature 4 security-review fix (Finding 4) - rotates the
    role's version STAMP to a brand-new random token rather than
    `cache.delete`-ing the permissions entry directly. This closes the
    cache-aside "lost invalidation" race: a slow concurrent reader that
    started computing BEFORE this call captured the OLD version in its
    own cache key, so its eventual `cache.set()` (landing after this call
    returns) writes to an already-superseded key that no future reader
    will ever look up again (`get_role_permissions` always resolves the
    CURRENT version first) - harmless, just wasted, rather than
    poisoning the live entry with stale data for up to
    `CACHE_TTL_SECONDS`. The old permissions entry itself is simply
    abandoned (never read again once the version moves) and expires via
    its own TTL - never `cache.clear()` (this fork's own repeated gotcha
    about accidentally flushing the real shared docker-compose Redis in a
    test/cleanup path).
    """
    cache.set(_version_key(role_id), uuid.uuid4().hex, timeout=CACHE_TTL_SECONDS)


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


def missing_protected_permissions(scheme_ids, *, override_scheme_id=None, override_items=None) -> list:
    """Category 11 feature 4 security-review fix (Finding 1) - shared
    anti-lockout simulation (exigence 4), factored out of
    `RoleSchemesAttachEndpoint._missing_protected_permissions` so
    `PermissionSchemeViewSet.partial_update` (which had NO such check at
    all before this fix, despite editing a bundle's items being just as
    capable of stripping a protected permission as detaching it) can
    reuse the exact same logic. Simulates the resulting
    `WorkspaceRole.PROTECTED_PERMISSION_KEYS` coverage entirely from
    already-known/not-yet-committed data - never touches
    `get_role_permissions`'s cache (which would read the OLD, stale state).

    - `scheme_ids`: the role's attached-scheme id set to simulate.
    - `override_scheme_id`/`override_items`: if `override_scheme_id` is
      one of `scheme_ids`, its REAL, currently-persisted items are
      ignored in favor of `override_items` (a list of dicts shaped like
      `PermissionSchemeItemInputSerializer.validated_data`, i.e.
      `{"permission": <Permission instance>, "condition": <str>}`) - the
      bundle-item-edit call site's own not-yet-committed payload. Left
      `None` for the attach/detach call site, whose `scheme_ids` is
      already the FINAL desired set with nothing left to override.

    Returns the subset of `PROTECTED_PERMISSION_KEYS` left with no
    unconditional (`NONE`) grant anywhere in the simulated set - empty
    means the anti-lockout guard is satisfied.
    """
    from plane.db.models import PermissionSchemeItem, WorkspaceRole

    granted_unconditionally = set()

    other_scheme_ids = [scheme_id for scheme_id in scheme_ids if scheme_id != override_scheme_id]
    if other_scheme_ids:
        items = PermissionSchemeItem.objects.filter(scheme_id__in=other_scheme_ids).select_related("permission")
        for item in items:
            if item.condition == "NONE":
                granted_unconditionally.add(item.permission.key)

    if override_scheme_id is not None and override_scheme_id in scheme_ids:
        for item in override_items or []:
            if item["condition"] == "NONE":
                granted_unconditionally.add(item["permission"].key)

    return [key for key in WorkspaceRole.PROTECTED_PERMISSION_KEYS if key not in granted_unconditionally]


def get_role_permissions(role_id) -> dict:
    """Cached union lookup - the O(1)-amortized read path (exigence 10).

    Category 11 feature 4 security-review fix (Finding 4) - the cache key
    embeds the version stamp read at the START of this call, BEFORE the
    (possibly slow) DB read/compute below. If a mutator invalidates
    concurrently while we're computing, `invalidate_role_permissions_cache`
    rotates the version to a new token - our own `cache.set()` below still
    targets the OLD version's key (computed from `version` captured here),
    which is now orphaned and will never be looked up by any future
    reader (they'll resolve the NEW version first) - it just expires via
    TTL, never poisoning the live entry.
    """
    from plane.db.models import WorkspaceRole

    version = _current_version(role_id)
    key = _cache_key(role_id, version)
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
        # Category 11 feature 4 security-review fix (Finding 3b) -
        # defense in depth against a DANGLING `custom_role_id` (points at
        # a soft-deleted `WorkspaceRole` row). `on_delete=PROTECT` never
        # actually fires through this fork's `SoftDeleteModel.delete()`
        # override (it sets `deleted_at` and saves - Django's FK
        # Collector, which enforces PROTECT, only runs on a real hard
        # delete), so nothing at the DB layer stops a role from being
        # deleted out from under a member that still references it -
        # `WorkspaceRoleViewSet.destroy`'s own app-level guard closes the
        # most common path (Finding 3a), but a dangling reference could
        # still occur via any other write path (Django admin, shell,
        # direct queryset ops). Without this fallback, `member.custom_role`
        # would still resolve here (a `select_related("custom_role")`
        # JOIN fetches the row regardless of soft-delete status), and
        # `get_role_permissions` would then raise-and-swallow
        # `WorkspaceRole.DoesNotExist` internally, silently resolving to
        # ZERO permissions - treat a dangling reference exactly like
        # `custom_role_id=None` instead, falling back to the legacy
        # system role below.
        try:
            custom_role = member.custom_role
        except WorkspaceRole.DoesNotExist:
            custom_role = None
        if custom_role is not None and custom_role.deleted_at is None:
            return custom_role

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
    # KNOWN FOLLOW-UP (not fixed by Finding 7, flagged there as
    # discretionary/low-severity, currently dead code - no in-scope
    # domain's real gate consults this resolver yet): for a `Page` with
    # more than one linked project, this evaluates true if the user leads
    # ANY of them, regardless of which project the actual request
    # concerns - it does not thread a specific request/resource project
    # context through. Finding 7's project-aware `has_permission` fix
    # below threads a project context through for BASE ROLE resolution,
    # but not into this ANY-of-M2M condition-refinement helper - doing so
    # would need this function's own signature to grow a
    # "current project" parameter no real call site can supply yet
    # (none of the 5 in-scope domains' OWN gates call into this resolver
    # today). Left as documented, deliberate scope boundary.
    for project in _iter_candidate_projects(resource):
        if project is not None and project.project_lead_id == user.id:
            return True
    return False


def _is_creator_or_owner(resource, user) -> bool:
    """Category 11 feature 4 security-review fix (Finding 9) -
    `CREATOR_ONLY`'s real-world meaning is "the person this fork's own
    code already treats as having a standing bypass on this resource",
    which for most of the 5 in-scope domains is `created_by_id` but for
    `Page` is `owned_by_id` (`ProjectPagePermission.has_permission`'s own
    `page.owned_by_id == user_id` check) - a distinct, independently
    mutable field (ownership transfer, `bulk_create` import with an
    explicit `owned_by_id`) that can diverge from `created_by_id`. If the
    resource has an `owned_by_id` attribute at all, that's authoritative;
    otherwise fall back to `created_by_id` (every other in-scope domain).
    """
    if hasattr(resource, "owned_by_id"):
        return resource.owned_by_id == user.id
    return getattr(resource, "created_by_id", None) == user.id


# Category 11 feature 4 security-review fix (Finding 7) - categories
# whose real gates are project-scoped (`ProjectMember.role`), never
# workspace-scoped, for the purposes of resolving a BASE role when a
# concrete `resource` is supplied. VIEW is deliberately handled
# separately below (only the `IssueViewViewSet`-shaped half - a concrete
# `resource.project_id` - is project-scoped; `WorkspaceViewViewSet`'s
# views are genuinely workspace-scoped and must keep using the
# WorkspaceMember-based baseline).
_PROJECT_SCOPED_CATEGORIES = ("ISSUE", "CYCLE", "MODULE", "PAGE")


def _permission_category(permission_key: str):
    from plane.db.models import Permission

    return Permission.objects.filter(key=permission_key).values_list("category", flat=True).first()


def _is_project_scoped_check(permission_key: str, resource) -> bool:
    category = _permission_category(permission_key)
    if category in _PROJECT_SCOPED_CATEGORIES:
        return True
    if category == "VIEW":
        return getattr(resource, "project_id", None) is not None
    return False


def _resolve_project_scoped_role(user, workspace_slug: str, resource):
    """Category 11 feature 4 security-review fix (Finding 7) - resolves
    the effective role via `ProjectMember.role` for the resource's
    project(s) (reusing `_iter_candidate_projects`'s existing duck-typed
    resolution), mapped to the matching SYSTEM `WorkspaceRole` baseline
    for this workspace - deliberately NOT the member's own workspace-level
    `custom_role`: a genuinely custom role applies UNIFORMLY across every
    project in this fork's v1 (spec exigence 9's own deliberate
    simplification - the carve-out is legitimate for a custom role an
    Owner deliberately composes), so there is no per-project "custom" axis
    to resolve here - only the legacy-value axis, which `ProjectMember.
    role` genuinely does vary by project (a workspace Member can be
    Project Admin or Project Guest in different projects).

    Returns `None` when no `ProjectMember` relationship exists for any of
    the resource's candidate project(s) (e.g. a workspace-scoped `Page`
    with zero linked projects) - the caller keeps the workspace-baseline
    role in that case, exactly as before this fix.

    A resource linked to more than one project (only `Page`'s M2M today)
    resolves the MOST PERMISSIVE (highest legacy role value) of the
    user's per-project roles across every linked project - mirrors
    `_is_project_lead`'s own "ANY resolved project" semantics for the
    same M2M shape.
    """
    from plane.db.models import ProjectMember, WorkspaceRole

    project_ids = [project.id for project in _iter_candidate_projects(resource) if project is not None]
    if not project_ids:
        return None

    project_roles = list(
        ProjectMember.objects.filter(member=user, project_id__in=project_ids, is_active=True).values_list(
            "role", flat=True
        )
    )
    if not project_roles:
        return None

    return WorkspaceRole.objects.filter(
        workspace__slug=workspace_slug, is_system=True, legacy_role_value=max(project_roles)
    ).first()


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

    # Category 11 feature 4 security-review fix (Finding 7) - the real
    # gates for ISSUE/CYCLE/MODULE/PAGE (and the project-scoped half of
    # VIEW) check `ProjectMember.role`, not `WorkspaceMember`/its
    # `custom_role` - a workspace Member can independently be a Project
    # Admin or Project Guest in different projects. When a concrete
    # `resource` is supplied and the permission being checked is one of
    # these project-scoped categories, resolve the base role via the
    # resource's own project(s) instead of the workspace-wide baseline -
    # this ONLY changes behavior when a resource is given; the
    # resource-less workspace-baseline summary (`GET /my-permissions/`,
    # `GET /roles/`) is unaffected on purpose (there is no single correct
    # per-project answer to give there).
    if resource is not None and _is_project_scoped_check(permission_key, resource):
        project_role = _resolve_project_scoped_role(user, workspace_slug, resource)
        if project_role is not None:
            role = project_role

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

    if "CREATOR_ONLY" in conditions and _is_creator_or_owner(resource, user):
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
