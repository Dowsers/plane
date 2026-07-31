# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Label Groups exclusivity - see docs/feature-specs/01-core-issue-tracking.md
("Label Groups avec exclusivité + fusion/re-scope") in plane-selfhost.

A label with a `parent` is considered part of that parent's group. At most
one label from a given group can be applied to an issue at a time - adding
one automatically removes any other label from the same group that the
issue already had.
"""

from plane.db.models import IssueLabel, Label


def enforce_label_group_exclusivity(issue_ids, new_label_ids):
    """Call AFTER new_label_ids have already been added (via IssueLabel) to
    the given issues. Removes any other label on those issues that shares a
    parent group with one of the newly-added labels, keeping only the most
    recently added row per (issue, group)."""
    if not issue_ids or not new_label_ids:
        return

    group_ids = set(
        str(parent_id)
        for parent_id in Label.objects.filter(pk__in=new_label_ids, parent_id__isnull=False).values_list(
            "parent_id", flat=True
        )
    )
    if not group_ids:
        return

    sibling_rows = (
        IssueLabel.objects.filter(issue_id__in=issue_ids, label__parent_id__in=group_ids)
        .select_related("label")
        .order_by("issue_id", "label__parent_id", "-created_at")
    )

    seen = set()
    to_delete_ids = []
    for row in sibling_rows:
        key = (str(row.issue_id), str(row.label.parent_id))
        if key in seen:
            to_delete_ids.append(row.id)
        else:
            seen.add(key)

    if to_delete_ids:
        IssueLabel.objects.filter(pk__in=to_delete_ids).delete()
