# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared "CODE-123" -> Issue resolution.

An issue's displayed code is either a Teamspace's `default_project_identifier`
(that team's shared pool) or a Workspace's `default_project_identifier` (that
workspace's single shared default pool) - see plane.utils.issue_sequencing
for how numbers are assigned. This module is the single place that resolves
a typed/pasted "CODE-123" string back to a specific Issue, reused by every
endpoint/tool that used to do this by looking up `Project.identifier`
directly (that lookup no longer applies - a project's own `identifier` is
never used to resolve or display an issue's ID).
"""

from django.db.models import Q


def resolve_issue_id_by_identifier(workspace_slug, code, sequence_number):
    """Returns the UUID of the Issue matching `CODE-<sequence_number>` in
    the given workspace, or None if nothing matches. Tries a team pool
    first, then the workspace's own default pool."""
    from plane.db.models import Issue

    issue_id = (
        Issue.objects.filter(
            sequence_teamspace__default_project_identifier__iexact=code,
            sequence_teamspace__workspace__slug=workspace_slug,
            sequence_id=sequence_number,
        )
        .values_list("id", flat=True)
        .first()
    )
    if issue_id:
        return issue_id

    return (
        Issue.objects.filter(
            sequence_teamspace__isnull=True,
            workspace__slug=workspace_slug,
            workspace__default_project_identifier__iexact=code,
            sequence_id=sequence_number,
        )
        .values_list("id", flat=True)
        .first()
    )


def resolve_issue_project_identifier(workspace_slug, code, sequence_number):
    """Returns the *project's own* `identifier` (not the display code) for
    whichever Issue `CODE-<sequence_number>` resolves to, or None. Used
    where a caller needs a real `Project.identifier` for an existing,
    project-identifier-keyed permission check (e.g.
    `ProjectEntityPermission`) to keep working unmodified against the
    issue's actual owning project."""
    from plane.db.models import Issue

    issue_id = resolve_issue_id_by_identifier(workspace_slug, code, sequence_number)
    if issue_id is None:
        return None
    return Issue.objects.filter(id=issue_id).values_list("project__identifier", flat=True).first()


def build_issue_identifier_q(workspace_slug, code, sequence_number):
    """Same resolution as `resolve_issue_id_by_identifier`, but as an
    OR-able `Q()` for callers that need to fold "does this look like an
    issue code" into an existing, broader search queryset instead of doing
    a standalone lookup (e.g. global search)."""
    return Q(
        sequence_teamspace__default_project_identifier__iexact=code,
        sequence_teamspace__workspace__slug=workspace_slug,
        sequence_id=sequence_number,
    ) | Q(
        sequence_teamspace__isnull=True,
        workspace__slug=workspace_slug,
        workspace__default_project_identifier__iexact=code,
        sequence_id=sequence_number,
    )
