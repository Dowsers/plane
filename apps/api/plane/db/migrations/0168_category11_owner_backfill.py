# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hand-written DATA migration (per this initiative's convention -
migrations are otherwise always auto-generated via `makemigrations`) -
category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 5 - "Rôle Owner dédié + Team/Project Owner
délégué", exigence 17.

Two independent backfills, both idempotent and safe to re-run:

1. `Workspace.owner` - for every workspace whose `owner` is NULL, or
   whose `owner` has no active `WorkspaceMember` row with `role >= 20` in
   that workspace, promote the first active Admin by `created_at`
   seniority. Logged (via Django's own `logging` module, not silently -
   the exigence's own wording) for manual review - both the
   successfully-fixed workspaces AND any workspace where no active Admin
   exists at all to promote (a pre-existing data problem this migration
   cannot safely resolve on its own).
2. `ProjectMember.is_owner` - seeded `True` for the `ProjectMember`
   matching each `Project.project_lead`, but ONLY where that membership
   is an active project Admin (role=20) - the same eligibility rule the
   live `ProjectOwnerEndpoint` enforces going forward. A `project_lead`
   that isn't an active Admin is logged and skipped rather than force-set,
   since nothing about a raw data migration should special-case around
   the application's own invariants. After this one-time seed, the two
   notions (`project_lead` = informational/UX, `is_owner` =
   permission-bearing) diverge freely - this migration does NOT keep
   them synced going forward.
"""

import logging

from django.db import migrations

logger = logging.getLogger("plane.migrations")

ADMIN_ROLE = 20


def backfill_workspace_owner(apps, schema_editor):
    Workspace = apps.get_model("db", "Workspace")
    WorkspaceMember = apps.get_model("db", "WorkspaceMember")

    promoted = []
    unresolved = []

    for workspace in Workspace.objects.filter(deleted_at__isnull=True).iterator():
        current_owner_is_valid = (
            workspace.owner_id is not None
            and WorkspaceMember.objects.filter(
                workspace_id=workspace.id,
                member_id=workspace.owner_id,
                is_active=True,
                role__gte=ADMIN_ROLE,
                deleted_at__isnull=True,
            ).exists()
        )
        if current_owner_is_valid:
            continue

        candidate = (
            WorkspaceMember.objects.filter(
                workspace_id=workspace.id,
                role__gte=ADMIN_ROLE,
                is_active=True,
                deleted_at__isnull=True,
            )
            .order_by("created_at")
            .first()
        )
        if candidate is None:
            unresolved.append(str(workspace.id))
            continue

        Workspace.objects.filter(pk=workspace.pk).update(owner_id=candidate.member_id)
        promoted.append((str(workspace.id), str(candidate.member_id)))

    if promoted:
        logger.warning(
            "Category 11 owner backfill: promoted a new Workspace.owner for %d workspace(s) whose "
            "previous owner was NULL/inactive/not-Admin: %s",
            len(promoted),
            promoted,
        )
    if unresolved:
        logger.error(
            "Category 11 owner backfill: %d workspace(s) have NO active Admin to promote as owner - "
            "manual review required: %s",
            len(unresolved),
            unresolved,
        )


def reverse_backfill_workspace_owner(apps, schema_editor):
    # Not reversible - the previous (NULL/invalid) owner value is not
    # recorded anywhere, and re-nulling `owner` would violate the
    # column's own NOT NULL constraint. A no-op reverse is intentional.
    pass


def backfill_project_owner_from_lead(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    ProjectMember = apps.get_model("db", "ProjectMember")

    seeded = []
    skipped = []

    for project in Project.objects.filter(project_lead__isnull=False, deleted_at__isnull=True).iterator():
        lead_membership = ProjectMember.objects.filter(
            project_id=project.id,
            member_id=project.project_lead_id,
            is_active=True,
            deleted_at__isnull=True,
        ).first()

        if lead_membership is None or lead_membership.role != ADMIN_ROLE:
            skipped.append(str(project.id))
            continue

        ProjectMember.objects.filter(pk=lead_membership.pk).update(is_owner=True)
        seeded.append(str(project.id))

    if seeded:
        logger.warning(
            "Category 11 owner backfill: seeded ProjectMember.is_owner=True from Project.project_lead "
            "for %d project(s): %s",
            len(seeded),
            seeded,
        )
    if skipped:
        logger.warning(
            "Category 11 owner backfill: skipped %d project(s) whose project_lead is not an active "
            "project Admin - Project Owner left unset, manual review optional: %s",
            len(skipped),
            skipped,
        )


def reverse_backfill_project_owner_from_lead(apps, schema_editor):
    ProjectMember = apps.get_model("db", "ProjectMember")
    ProjectMember.objects.filter(is_owner=True).update(is_owner=False)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0167_category11_owner_audit_log"),
    ]

    operations = [
        migrations.RunPython(backfill_workspace_owner, reverse_backfill_workspace_owner),
        migrations.RunPython(backfill_project_owner_from_lead, reverse_backfill_project_owner_from_lead),
    ]
