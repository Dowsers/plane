# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Single place computing an issue's displayed ID prefix - its team's pool
prefix if it currently belongs to one, otherwise its workspace's shared
default pool prefix. Never `issue.project.identifier` - a project's own
identifier is never used to resolve or display an issue's ID. See
plane.utils.issue_sequencing for how `sequence_teamspace` is assigned."""


from django.db.models import Case, F, When

SEQUENCE_PREFIX_ANNOTATION = Case(
    When(sequence_teamspace__isnull=False, then=F("sequence_teamspace__default_project_identifier")),
    default=F("workspace__default_project_identifier"),
)


def get_issue_sequence_prefix(issue) -> str:
    if issue.sequence_teamspace_id:
        return issue.sequence_teamspace.default_project_identifier
    return issue.workspace.default_project_identifier


def annotate_sequence_prefix(queryset):
    """SQL equivalent of `get_issue_sequence_prefix`, for the list
    endpoints that project rows straight to dicts with `.values(...)` and
    so never run a serializer. `sequence_prefix` is computed in Python and
    cannot appear in a `.values()` field list unless annotated first, so
    without this those responses silently fall back to the project's own
    identifier on the client. Mirrors the branch above exactly - a
    `Coalesce` would not, since it would keep a team whose prefix is an
    empty string rather than falling through to the workspace."""
    return queryset.annotate(sequence_prefix=SEQUENCE_PREFIX_ANNOTATION)
