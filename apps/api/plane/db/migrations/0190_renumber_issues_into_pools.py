# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""One-time renumbering of every pre-existing issue into the new
team-pool / workspace-default-pool scheme (see
plane.utils.issue_sequencing). Before this migration, `Issue.sequence_id`
was scoped per-project; after it, every issue belongs to exactly one of:

- its project's current `primary_teamspace`'s shared, cross-project pool, or
- its workspace's own single shared default pool (no current team).

This is an explicitly accepted, one-time breaking change: every issue's
displayed ID (and any external link/bookmark/PR reference to it) changes.
An `IssueActivity` entry recording the old identifier is created for each
renumbered issue for traceability, but the old identifier itself is not
preserved anywhere else.

Runs automatically on `manage.py migrate` (this fork's self-hosted
instances apply migrations unattended on every deploy) - idempotent via
the `sequence_teamspace__isnull=True` filter, so re-running it (e.g. if a
deploy is retried) only picks up issues that haven't been placed in a pool
yet.
"""

import re

from django.db import migrations, transaction
from django.db.models import Max

BATCH_SIZE = 500


def _sanitize_prefix(value):
    return re.sub(r"[^A-Za-z0-9]", "", value or "").upper()


def _renumber_into_pool(issues, teamspace, workspace, Issue, IssueSequence, IssueActivity):
    """`issues` - ordered by created_at, all currently `sequence_teamspace`
    is-null, all belonging to `workspace`. Continues after whatever's
    already been assigned to this pool (relevant if this migration is
    re-run after a partial previous run, or if the pool already has issues
    created after deploy but before this migration ran)."""
    if not issues:
        return

    if teamspace is not None:
        last_sequence = IssueSequence._default_manager.filter(teamspace=teamspace).aggregate(largest=Max("sequence"))[
            "largest"
        ]
    else:
        last_sequence = IssueSequence._default_manager.filter(teamspace__isnull=True, workspace=workspace).aggregate(
            largest=Max("sequence")
        )["largest"]

    next_sequence = (last_sequence or 0) + 1

    for batch_start in range(0, len(issues), BATCH_SIZE):
        batch = issues[batch_start : batch_start + BATCH_SIZE]
        activities = []
        for issue in batch:
            old_identifier = f"{issue._old_project_identifier}-{issue.sequence_id}"
            new_identifier = f"{(teamspace.default_project_identifier if teamspace else workspace.default_project_identifier)}-{next_sequence}"
            issue.sequence_id = next_sequence
            issue.sequence_teamspace = teamspace
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
                        f"Work item renumbered from {old_identifier} to {new_identifier} - existing issues were "
                        "migrated onto the new team/workspace shared ID-pool scheme."
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
            IssueActivity._default_manager.bulk_create(activities)


def renumber_issues_into_pools(apps, schema_editor):
    Workspace = apps.get_model("db", "Workspace")
    Teamspace = apps.get_model("db", "Teamspace")
    Project = apps.get_model("db", "Project")
    Issue = apps.get_model("db", "Issue")
    IssueSequence = apps.get_model("db", "IssueSequence")
    IssueActivity = apps.get_model("db", "IssueActivity")

    for workspace in Workspace._default_manager.all():
        # A blank default pool prefix would produce a bare "-123" display
        # id for every team-less project's issues - fall back to a
        # sanitized workspace slug rather than ship that.
        if not (workspace.default_project_identifier or "").strip():
            fallback = _sanitize_prefix(workspace.slug) or "WS"
            workspace.default_project_identifier = fallback
            workspace.save(update_fields=["default_project_identifier"])

        projects_by_id = {p.id: p for p in Project._default_manager.filter(workspace=workspace)}

        for teamspace in Teamspace._default_manager.filter(workspace=workspace, deleted_at__isnull=True):
            project_ids = [p.id for p in projects_by_id.values() if p.primary_teamspace_id == teamspace.id]
            if not project_ids:
                continue
            issues = list(
                Issue._default_manager.filter(
                    project_id__in=project_ids, sequence_teamspace__isnull=True, deleted_at__isnull=True
                ).order_by("created_at")
            )
            for issue in issues:
                issue._old_project_identifier = projects_by_id[issue.project_id].identifier
            _renumber_into_pool(issues, teamspace, workspace, Issue, IssueSequence, IssueActivity)

        no_team_project_ids = [p.id for p in projects_by_id.values() if p.primary_teamspace_id is None]
        if no_team_project_ids:
            issues = list(
                Issue._default_manager.filter(
                    project_id__in=no_team_project_ids, sequence_teamspace__isnull=True, deleted_at__isnull=True
                ).order_by("created_at")
            )
            for issue in issues:
                issue._old_project_identifier = projects_by_id[issue.project_id].identifier
            _renumber_into_pool(issues, None, workspace, Issue, IssueSequence, IssueActivity)


def noop_reverse(apps, schema_editor):
    # Deliberately not reversible - the old per-project sequence_id values
    # are not preserved anywhere once overwritten.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0189_issue_sequence_teamspace_issuesequence_teamspace"),
    ]

    operations = [
        migrations.RunPython(renumber_issues_into_pools, noop_reverse),
    ]
