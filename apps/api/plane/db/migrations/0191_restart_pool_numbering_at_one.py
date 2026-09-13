# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Corrects the starting point of the pools created by migration 0190.

0190 seeded each pool's next number from `Max(IssueSequence.sequence)`,
but `issue_sequences` is an append-only ledger that still held every
*pre-rework, per-project* series. For a team pool that was harmless (those
legacy rows all have `teamspace IS NULL`, so they were filtered out), but
each workspace's default pool matched them all and therefore started well
past 1 - on the instance this was first deployed to, DOW began at 549 and
CODIR at 8 instead of both beginning at 1.

Nothing was corrupt: the IDs were unique within their pool and continued
correctly. This migration only removes the cosmetic offset, by discarding
the now-meaningless legacy ledger (those per-project numbers stopped being
valid the moment 0190 ran) and renumbering every pool from 1, preserving
each pool's chronological order.

Like 0190 this rewrites displayed IDs, and an `IssueActivity` row is
written for each change so the trail from the original identifier stays
complete. Only ever meaningful once - re-running it is safe but pointless.
"""

from django.db import migrations, transaction

BATCH_SIZE = 500


def _renumber_pool_from_one(issues, teamspace, workspace, Issue, IssueSequence, IssueActivity, prefix_by_issue):
    """`issues` - every live issue in this pool, ordered by created_at.
    Always restarts at 1: the ledger has just been cleared, so there is no
    prior cursor to continue from."""
    if not issues:
        return

    pool_prefix = teamspace.default_project_identifier if teamspace else workspace.default_project_identifier
    next_sequence = 1

    for batch_start in range(0, len(issues), BATCH_SIZE):
        batch = issues[batch_start : batch_start + BATCH_SIZE]
        activities = []
        for issue in batch:
            old_identifier = f"{prefix_by_issue[issue.id]}-{issue.sequence_id}"
            new_identifier = f"{pool_prefix}-{next_sequence}"
            issue.sequence_id = next_sequence
            issue.sequence_teamspace = teamspace
            if old_identifier != new_identifier:
                activities.append(
                    IssueActivity(
                        issue_id=issue.id,
                        project_id=issue.project_id,
                        workspace_id=workspace.id,
                        actor=None,
                        verb="updated",
                        field="sequence_id",
                        old_value=old_identifier,
                        new_value=new_identifier,
                        comment=(
                            f"Work item renumbered from {old_identifier} to {new_identifier} - the shared "
                            "team/workspace ID pools were restarted at 1."
                        ),
                    )
                )
            next_sequence += 1

        with transaction.atomic():
            Issue._default_manager.bulk_update(batch, ["sequence_id", "sequence_teamspace"])
            IssueSequence._default_manager.bulk_create(
                [
                    IssueSequence(
                        issue_id=issue.id,
                        project_id=issue.project_id,
                        workspace_id=workspace.id,
                        teamspace=issue.sequence_teamspace,
                        sequence=issue.sequence_id,
                    )
                    for issue in batch
                ]
            )
            if activities:
                IssueActivity._default_manager.bulk_create(activities)


def restart_pool_numbering_at_one(apps, schema_editor):
    Workspace = apps.get_model("db", "Workspace")
    Teamspace = apps.get_model("db", "Teamspace")
    Project = apps.get_model("db", "Project")
    Issue = apps.get_model("db", "Issue")
    IssueSequence = apps.get_model("db", "IssueSequence")
    IssueActivity = apps.get_model("db", "IssueActivity")

    # Raw DELETE rather than the ORM: `IssueSequence` carries a `deleted`
    # flag and this model family uses soft-deleting managers, and a
    # soft-deleted row still satisfies the `Max(sequence)` pool cursor -
    # which is the exact bug being fixed here. The ledger is rebuilt in
    # full below, and only that cursor ever reads it.
    schema_editor.execute("DELETE FROM issue_sequences")

    for workspace in Workspace._default_manager.all():
        projects_by_id = {p.id: p for p in Project._default_manager.filter(workspace=workspace)}
        if not projects_by_id:
            continue

        def load(project_ids):
            issues = list(
                Issue._default_manager.filter(project_id__in=project_ids, deleted_at__isnull=True).order_by(
                    "created_at"
                )
            )
            # Capture each issue's *current* displayed prefix before it is
            # overwritten, so the activity entry names the ID users are
            # actually looking at right now (a 0190 pool prefix), not the
            # long-gone per-project identifier.
            prefixes = {
                i.id: (
                    i.sequence_teamspace.default_project_identifier
                    if i.sequence_teamspace_id
                    else workspace.default_project_identifier
                )
                for i in issues
            }
            return issues, prefixes

        for teamspace in Teamspace._default_manager.filter(workspace=workspace, deleted_at__isnull=True):
            project_ids = [p.id for p in projects_by_id.values() if p.primary_teamspace_id == teamspace.id]
            if not project_ids:
                continue
            issues, prefixes = load(project_ids)
            _renumber_pool_from_one(issues, teamspace, workspace, Issue, IssueSequence, IssueActivity, prefixes)

        no_team_project_ids = [p.id for p in projects_by_id.values() if p.primary_teamspace_id is None]
        if no_team_project_ids:
            issues, prefixes = load(no_team_project_ids)
            _renumber_pool_from_one(issues, None, workspace, Issue, IssueSequence, IssueActivity, prefixes)


def noop_reverse(apps, schema_editor):
    # Deliberately not reversible, for the same reason as 0190: the
    # superseded sequence numbers are not preserved anywhere.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0190_renumber_issues_into_pools"),
    ]

    operations = [
        migrations.RunPython(restart_pool_numbering_at_one, noop_reverse),
    ]
