# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared work-item ID sequencing engine.

Every issue's number is drawn from exactly one of two kinds of pool:
- a Teamspace's own shared, cross-project series (all projects currently
  pointing at that team via `Project.primary_teamspace` interleave into
  it), or
- the owning workspace's single shared default series (every project with
  no current team).

There is no more per-project pool. `assign_next_sequence` is the one place
that computes "what's the next number in this pool" and is reused by
`Issue.save()` (a single new issue), a project's team being changed after
the fact (bulk-renumber that project's existing issues into the new pool),
and the one-time deploy migration that renumbers every pre-existing issue
in the database into this scheme.
"""

from django.db import connection
from django.db.models import Max

from plane.utils.uuid import convert_uuid_to_integer


def assign_next_sequence(issues, teamspace, workspace=None):
    """Assigns `sequence_id`/`sequence_teamspace` to each of `issues`, in
    the given order, continuing whichever pool `teamspace` (or, if
    `teamspace` is None, `workspace`) currently points at.

    Mutates the given Issue instances in-memory only - does not save them
    or create `IssueSequence` ledger rows. Callers persist both, since the
    right persistence shape differs (a single `Issue.save()` insert vs. a
    bulk `bulk_update`/`bulk_create` for a renumber).

    Must be called from inside a `transaction.atomic()` block - takes a
    transaction-scoped `pg_advisory_xact_lock` keyed by the pool (the
    Teamspace's id, or the Workspace's id for the default pool), so
    concurrent issue creation/renumbering across sibling projects sharing
    one pool can never race for the same next number.
    """
    from plane.db.models import IssueSequence

    issues = list(issues)
    if not issues:
        return issues

    pool_workspace = workspace or issues[0].workspace
    lock_key = convert_uuid_to_integer(teamspace.id if teamspace else pool_workspace.id)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])

    if teamspace is not None:
        last_sequence = IssueSequence.objects.filter(teamspace=teamspace).aggregate(largest=Max("sequence"))["largest"]
    else:
        last_sequence = IssueSequence.objects.filter(teamspace__isnull=True, workspace=pool_workspace).aggregate(
            largest=Max("sequence")
        )["largest"]

    next_sequence = (last_sequence or 0) + 1
    for issue in issues:
        issue.sequence_id = next_sequence
        issue.sequence_teamspace = teamspace
        next_sequence += 1
    return issues
