# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hand-written DATA migration (per this initiative's convention -
migrations are otherwise always auto-generated via `makemigrations`) -
category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 4 "Constructeur de roles personnalises".

Self-contained on purpose (no import from `plane.utils.rbac` or any other
app module) - this migration must remain historically stable even if a
later commit changes that module's logic; every constant it needs is
duplicated here inline (small, deliberate duplication), matching this
migration's own predecessors (`0167`/`0168`/`0169`/`0171`).

Four steps, each idempotent (safe to re-run - checked in the throwaway
verification suite):

1. Seed the read-only `Permission` catalogue (25 rows across the 5
   in-scope domains ISSUE/CYCLE/MODULE/PAGE/VIEW + WORKSPACE, see
   `PERMISSION_CATALOGUE` below for the full reasoning per permission).
2. Create exactly 3 GLOBAL (`workspace=None`) system `PermissionScheme`
   rows - "System: Admin Baseline" / "System: Member Baseline" /
   "System: Guest Baseline" - ONCE, shared by every workspace's own
   system `WorkspaceRole` rows (not duplicated per workspace - see
   `PermissionScheme`'s own docstring for why this is safe), each
   populated with `PermissionSchemeItem` rows reproducing this fork's
   REAL current Admin/Member/Guest behavior for the 5 in-scope domains,
   derived from actually reading every real `@allow_permission(...)`/
   `permission_classes` gate in `plane.app.views.{issue,cycle,module,
   page,view}` and `plane.app.permissions.page.ProjectPagePermission`
   (see this feature's own build report for the full call-site-by-
   call-site derivation - too long to repeat here, the short version is
   inline as comments on `SYSTEM_SCHEME_ITEMS` below).
3. For every existing workspace, create its own 3 system `WorkspaceRole`
   rows (Admin/Member/Guest, `is_system=True`, `legacy_role_value`=20/15/5,
   `is_owner_equivalent`=True for Admin only) + `WorkspaceRoleScheme` rows
   attaching each to the matching GLOBAL baseline scheme from step 2.
4. Backfill `WorkspaceMember.custom_role` from the existing `role`
   integer, for every workspace, via a real bulk `.update()` per
   (workspace, legacy role value) group - the actual "bulk path" this
   feature's own explicit-sync convention (decision #2 - no signal) has
   to get right from the very first write.
"""

import logging

from django.db import migrations

logger = logging.getLogger("plane.migrations")


ADMIN = 20
MEMBER = 15
GUEST = 5

NONE = "NONE"
CREATOR_ONLY = "CREATOR_ONLY"
PROJECT_LEAD_ONLY = "PROJECT_LEAD_ONLY"

# (key, category, label, description, supported_conditions)
#
# Granularity reasoning (decision #7): roughly one atomic permission per
# real, distinct gating decision this fork's OWN code already makes
# within the 5 in-scope domains - not so fine it's unusable to configure,
# not so coarse it's meaningless. `*.create` permissions never support
# CREATOR_ONLY (nothing exists yet at create time to check a creator
# against) or, for CYCLE/MODULE/PAGE, PROJECT_LEAD_ONLY either (no real
# precedent for gating creation itself by project lead in this fork's
# actual code - unlike editing/deleting an existing resource, where a
# real creator-bypass already exists to generalize). `PROJECT_LEAD_ONLY`
# is included in ISSUE/CYCLE/MODULE (always exactly one required parent
# `Project`, `ProjectBaseModel`) and PAGE (M2M `projects`, evaluated
# against ANY linked project - matches the spec's own explicit example
# user story, "publier une page... aux seuls project leads") but
# deliberately EXCLUDED from VIEW (a view can be workspace-scoped with NO
# project at all, `IssueView.project` is nullable - the whole VIEW
# category categorically lacks a guaranteed parent project, exactly
# exigence 8's own literal rejection example) and from WORKSPACE (no
# project relationship of any kind).
PERMISSION_CATALOGUE = [
    # --- ISSUE ---------------------------------------------------------
    (
        "issue.create",
        "ISSUE",
        "Create issues",
        "Create a new issue in a project.",
        [NONE],
    ),
    (
        "issue.edit",
        "ISSUE",
        "Edit issues",
        "Edit any field of an existing issue (title, description, assignees, labels...).",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    (
        "issue.delete",
        "ISSUE",
        "Delete issues",
        "Permanently delete an issue.",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    (
        "issue.change_state",
        "ISSUE",
        "Change issue state",
        "Move an issue between workflow states. Today this is not gated "
        "separately from issue.edit in this fork's own code (state is "
        "just one of the fields a partial_update can touch) - this "
        "catalogue entry anticipates the granularity this feature exists "
        "to provide (the spec's own 'role QA qui ne peut fermer que les "
        "issues qu'il a lui-meme creees' user story), seeded identically "
        "to issue.edit's real distribution since no narrower real signal "
        "exists to seed differently.",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    (
        "issue.comment",
        "ISSUE",
        "Comment on issues",
        "Post a new comment on an issue.",
        [NONE],
    ),
    (
        "issue.manage_comments",
        "ISSUE",
        "Edit/delete others' comments",
        "Edit or delete a comment authored by someone else.",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    (
        "issue.manage_attachments",
        "ISSUE",
        "Manage attachments",
        "Delete a file attachment from an issue.",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    (
        "issue.manage_labels",
        "ISSUE",
        "Manage labels",
        "Create/edit/delete a project's labels. No creator concept exists "
        "for a label today.",
        [NONE, PROJECT_LEAD_ONLY],
    ),
    (
        "issue.manage_relations",
        "ISSUE",
        "Manage issue relations",
        "Link/unlink issues (blocks, relates to, duplicate of...).",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    # --- CYCLE -----------------------------------------------------------
    ("cycle.create", "CYCLE", "Create cycles", "Create a new cycle.", [NONE]),
    (
        "cycle.manage",
        "CYCLE",
        "Manage cycles",
        "Edit a cycle's own fields, schedule, and issue membership. No "
        "creator-bypass exists for editing a cycle today (only deleting "
        "one does) so CREATOR_ONLY is deliberately not offered here.",
        [NONE, PROJECT_LEAD_ONLY],
    ),
    (
        "cycle.delete",
        "CYCLE",
        "Delete cycles",
        "Permanently delete a cycle.",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    # --- MODULE ----------------------------------------------------------
    ("module.create", "MODULE", "Create modules", "Create a new module.", [NONE]),
    (
        "module.manage",
        "MODULE",
        "Manage modules",
        "Edit a module's own fields, links, and issue membership. Same "
        "no-creator-bypass-on-edit reasoning as cycle.manage.",
        [NONE, PROJECT_LEAD_ONLY],
    ),
    (
        "module.delete",
        "MODULE",
        "Delete modules",
        "Permanently delete a module.",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    # --- PAGE --------------------------------------------------------
    ("page.create", "PAGE", "Create pages", "Create a new page.", [NONE]),
    (
        "page.manage",
        "PAGE",
        "Manage pages",
        "Edit, lock, archive, or change the public/private access of a "
        "page (the real `ProjectPagePermission` POST/PUT/PATCH bucket).",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    (
        "page.delete",
        "PAGE",
        "Delete pages",
        "Permanently delete a page, or unlock/unarchive one (the real "
        "`ProjectPagePermission` DELETE bucket - unlock/unarchive are "
        "DELETE-method actions in this fork's own routing, gated "
        "identically to destroy).",
        [NONE, CREATOR_ONLY, PROJECT_LEAD_ONLY],
    ),
    # --- VIEW --------------------------------------------------------
    (
        "view.create",
        "VIEW",
        "Create views",
        "Create a new saved issue view. NOTE (found, not fixed by this "
        "feature - flagged for the adversarial review phase): this "
        "fork's real `IssueViewViewSet`/`WorkspaceViewViewSet` have NO "
        "`create()` override and no class-level `permission_classes` "
        "beyond the base `IsAuthenticated` - view creation is not "
        "actually role-gated at all today. Seeded here as NONE for every "
        "role (the intended/reasonable behavior), not wired to the real "
        "view in this pass (decision: the 5 in-scope domains' existing "
        "views are NOT rewired to consult this new catalogue in v1).",
        [NONE],
    ),
    (
        "view.edit",
        "VIEW",
        "Edit views",
        "Edit a saved view's filters/name. Real current behavior has NO "
        "admin bypass at all - `allow_permission(allowed_roles=[], "
        "creator=True, model=IssueView)` means only the view's own owner "
        "can ever edit it, regardless of role - seeded as CREATOR_ONLY "
        "for every role, including Admin, to match.",
        [NONE, CREATOR_ONLY],
    ),
    (
        "view.delete",
        "VIEW",
        "Delete views",
        "Delete a saved view. Admin can delete any view unconditionally; "
        "everyone else only their own.",
        [NONE, CREATOR_ONLY],
    ),
    # --- WORKSPACE (see module docstring - not one of the 5 in-scope
    # domains; exists only for the anti-lockout guard (exigence 4) and to
    # gate this feature's OWN endpoints) --------------------------------
    (
        "workspace.delete",
        "WORKSPACE",
        "Delete workspace",
        "Symbolic anti-lockout catalogue entry (exigence 4) - the REAL "
        "runtime gate for workspace deletion is and remains the "
        "independent, supreme `IsWorkspaceOwner` (category 11 features "
        "3+5), never this bundle system.",
        [NONE],
    ),
    (
        "workspace.manage_billing",
        "WORKSPACE",
        "Manage billing",
        "Symbolic anti-lockout catalogue entry (exigence 4), same "
        "reasoning as workspace.delete.",
        [NONE],
    ),
    (
        "workspace.manage_members",
        "WORKSPACE",
        "Manage workspace members",
        "Symbolic anti-lockout catalogue entry (exigence 4), same "
        "reasoning as workspace.delete.",
        [NONE],
    ),
    (
        "workspace.manage_roles",
        "WORKSPACE",
        "Manage roles and permission bundles",
        "The ONE WORKSPACE-category permission this feature's own new "
        "endpoints genuinely, live enforce - gates every "
        "permission-scheme/role CRUD endpoint this migration's own "
        "feature adds (exigence 6). Owner bypasses independently via "
        "IsWorkspaceOwner regardless of this permission (decision #1).",
        [NONE],
    ),
]

# Real derivation, per system role, of what each already grants today in
# the 5 in-scope domains - see this feature's own build report for the
# full call-site citations (file:line) behind every one of these.
SYSTEM_SCHEME_ITEMS = {
    "Admin": [
        ("issue.create", NONE),
        ("issue.edit", NONE),
        ("issue.delete", NONE),
        ("issue.change_state", NONE),
        ("issue.comment", NONE),
        ("issue.manage_comments", NONE),
        ("issue.manage_attachments", NONE),
        ("issue.manage_labels", NONE),
        ("issue.manage_relations", NONE),
        ("cycle.create", NONE),
        ("cycle.manage", NONE),
        ("cycle.delete", NONE),
        ("module.create", NONE),
        ("module.manage", NONE),
        ("module.delete", NONE),
        ("page.create", NONE),
        ("page.manage", NONE),
        ("page.delete", NONE),
        ("view.create", NONE),
        # Real finding: NO admin bypass exists for editing another
        # member's view today - see the view.edit catalogue entry above.
        ("view.edit", CREATOR_ONLY),
        ("view.delete", NONE),
        ("workspace.delete", NONE),
        ("workspace.manage_billing", NONE),
        ("workspace.manage_members", NONE),
        ("workspace.manage_roles", NONE),
    ],
    "Member": [
        ("issue.create", NONE),
        ("issue.edit", NONE),
        ("issue.delete", CREATOR_ONLY),
        ("issue.change_state", NONE),
        ("issue.comment", NONE),
        ("issue.manage_comments", CREATOR_ONLY),
        ("issue.manage_attachments", CREATOR_ONLY),
        # Real finding: label management is Admin-only, Member excluded.
        ("issue.manage_relations", NONE),
        ("cycle.create", NONE),
        ("cycle.manage", NONE),
        ("cycle.delete", CREATOR_ONLY),
        ("module.create", NONE),
        ("module.manage", NONE),
        ("module.delete", CREATOR_ONLY),
        ("page.create", NONE),
        ("page.manage", NONE),
        ("page.delete", CREATOR_ONLY),
        ("view.create", NONE),
        ("view.edit", CREATOR_ONLY),
        ("view.delete", CREATOR_ONLY),
    ],
    "Guest": [
        ("issue.comment", NONE),
        # Real finding: a Guest can only ever act as the creator-bypass -
        # `allow_permission` never grants GUEST an unconditional role-based
        # branch for edit/delete/state-change; the creator check runs
        # first and requires only active workspace membership, which a
        # Guest has.
        ("issue.edit", CREATOR_ONLY),
        ("issue.delete", CREATOR_ONLY),
        ("issue.change_state", CREATOR_ONLY),
        ("issue.manage_comments", CREATOR_ONLY),
        ("issue.manage_attachments", CREATOR_ONLY),
        # Category 11 feature 4 security-review fix (Finding 8) -
        # `issue.manage_relations` was seeded here unconditionally
        # (a copy/paste slip from the CREATOR_ONLY entries just above),
        # but the real gate (`IssueRelationViewSet` via
        # `ProjectEntityPermission`) requires `ProjectMember.role in
        # [ADMIN, MEMBER]` with zero creator bypass and zero Guest path -
        # no Guest can ever do this in real code, exactly like the
        # "Deliberately NO issue.create, issue.manage_labels, cycle.*,
        # module.*..." comment below already documents for its own
        # adjacent exclusions. Removed rather than left seeded as NONE.
        ("view.create", NONE),
        ("view.edit", CREATOR_ONLY),
        ("view.delete", CREATOR_ONLY),
        # Real finding: a Guest can never CREATE a page (`ProjectPagePermission`'s
        # own POST bucket is `role in [ADMIN, MEMBER]` only), but the
        # unconditional top-level `page.owned_by_id == user_id` bypass in
        # that same permission class still lets a Guest who somehow OWNS
        # a page (ownership transfer, import) manage/delete it.
        ("page.manage", CREATOR_ONLY),
        ("page.delete", CREATOR_ONLY),
        # Deliberately NO issue.create, issue.manage_labels,
        # issue.manage_relations, cycle.*, module.*, page.create,
        # workspace.* - Guest cannot do any of these today, with or
        # without being a "creator" (there is no role-based OR
        # creator-based path granting them in the real code).
    ],
}

SYSTEM_ROLE_DEFS = [
    ("Admin", ADMIN, True),
    ("Member", MEMBER, False),
    ("Guest", GUEST, False),
]


def seed_rbac(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    PermissionScheme = apps.get_model("db", "PermissionScheme")
    PermissionSchemeItem = apps.get_model("db", "PermissionSchemeItem")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    WorkspaceRoleScheme = apps.get_model("db", "WorkspaceRoleScheme")
    Workspace = apps.get_model("db", "Workspace")
    WorkspaceMember = apps.get_model("db", "WorkspaceMember")

    # 1. Permission catalogue.
    permissions_by_key = {}
    for key, category, label, description, supported_conditions in PERMISSION_CATALOGUE:
        permission, _ = Permission.objects.update_or_create(
            key=key,
            defaults={
                "category": category,
                "label": label,
                "description": description,
                "supported_conditions": supported_conditions,
            },
        )
        permissions_by_key[key] = permission

    # 2. Three GLOBAL system baseline schemes, created once.
    schemes_by_role_name = {}
    for role_name, items in SYSTEM_SCHEME_ITEMS.items():
        scheme, _ = PermissionScheme.objects.update_or_create(
            workspace=None,
            name=f"System: {role_name} Baseline",
            defaults={
                "description": f"Read-only baseline bundle reproducing this fork's real, "
                f"pre-existing {role_name} behavior for the 5 in-scope domains "
                f"(Issue/Cycle/Module/Page/View). Shared globally across every "
                f"workspace - not editable via the bundle CRUD endpoint.",
                "is_system": True,
            },
        )
        schemes_by_role_name[role_name] = scheme
        for permission_key, condition in items:
            PermissionSchemeItem.objects.update_or_create(
                scheme=scheme,
                permission=permissions_by_key[permission_key],
                defaults={"condition": condition},
            )

    # 3 & 4. Per-workspace system roles + scheme attachment + member backfill.
    workspace_count = 0
    member_count = 0
    for workspace in Workspace.objects.filter(deleted_at__isnull=True).iterator():
        workspace_count += 1
        roles_by_legacy_value = {}
        for role_name, legacy_value, is_owner_equivalent in SYSTEM_ROLE_DEFS:
            role, _ = WorkspaceRole.objects.update_or_create(
                workspace=workspace,
                is_system=True,
                legacy_role_value=legacy_value,
                defaults={
                    "name": role_name,
                    "description": f"System role migrated from the legacy role integer "
                    f"{legacy_value} - not deletable.",
                    "is_owner_equivalent": is_owner_equivalent,
                },
            )
            roles_by_legacy_value[legacy_value] = role
            WorkspaceRoleScheme.objects.update_or_create(
                role=role, scheme=schemes_by_role_name[role_name]
            )

        for legacy_value, role in roles_by_legacy_value.items():
            updated = WorkspaceMember.objects.filter(
                workspace=workspace, role=legacy_value, custom_role__isnull=True
            ).update(custom_role=role)
            member_count += updated

    logger.warning(
        "Category 11 feature 4 RBAC seed: migrated %d workspace(s), backfilled custom_role "
        "for %d WorkspaceMember row(s).",
        workspace_count,
        member_count,
    )


def unseed_rbac(apps, schema_editor):
    # Not reversible in a way that restores nothing-ever-existed - a
    # real workspace may by now have created its OWN custom roles/bundles
    # referencing these system rows (PROTECT/CASCADE FKs would block a
    # blind delete anyway). A no-op reverse is intentional, matching this
    # migration's own predecessor (0168)'s reverse-is-a-no-op precedent
    # for the same "can't safely undo a real backfill" reasoning.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0172_category11_rbac_models"),
    ]

    operations = [
        migrations.RunPython(seed_rbac, unseed_rbac),
    ]
