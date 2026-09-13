# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Single place computing an issue's displayed ID prefix - its team's pool
prefix if it currently belongs to one, otherwise its workspace's shared
default pool prefix. Never `issue.project.identifier` - a project's own
identifier is never used to resolve or display an issue's ID. See
plane.utils.issue_sequencing for how `sequence_teamspace` is assigned."""


def get_issue_sequence_prefix(issue) -> str:
    if issue.sequence_teamspace_id:
        return issue.sequence_teamspace.default_project_identifier
    return issue.workspace.default_project_identifier
