# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Sub-issue lifecycle automations - see
docs/feature-specs/01-core-issue-tracking.md ("Automatisations de cycle de
vie des sous-tâches") in plane-selfhost for the full spec.

Called explicitly from the views that change an issue's state (single-issue
partial_update, bulk operations) rather than via a Django signal, matching
the rest of the codebase's convention (see close_old_issues in
bgtasks/issue_automation_task.py for the same "requested_data={'closed_to':
...}" activity-logging pattern this reuses).
"""

import json

from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, State

CLOSED_STATE_GROUPS = ["completed", "cancelled"]
MAX_PARENT_CHAIN_DEPTH = 20


def _resolve_close_state(project):
    if project.sub_issue_auto_close_state_id is not None:
        return project.sub_issue_auto_close_state
    if project.default_state_id is not None:
        return project.default_state
    return State.objects.filter(project_id=project.id, group="completed").first()


def _log_auto_close(issue_id, project_id, state_id, actor_id, epoch):
    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps({"closed_to": str(state_id)}),
        actor_id=str(actor_id),
        issue_id=str(issue_id),
        project_id=str(project_id),
        current_instance=None,
        epoch=epoch,
        notification=True,
    )


def _cascade_close_sub_issues(issue, actor_id, epoch):
    """If `issue`'s own project wants it, close all of its direct sub-issues
    that aren't already completed/cancelled. Bounded to one level - a
    sub-issue's own children are not touched."""
    project = issue.project
    if not project.sub_issue_cascade_close:
        return

    close_state = _resolve_close_state(project)
    if close_state is None:
        return

    sub_issues = list(Issue.issue_objects.filter(parent_id=issue.id).exclude(state__group__in=CLOSED_STATE_GROUPS))
    if not sub_issues:
        return

    for sub_issue in sub_issues:
        sub_issue.state = close_state
    Issue.objects.bulk_update(sub_issues, ["state"])
    for sub_issue in sub_issues:
        _log_auto_close(sub_issue.id, sub_issue.project_id, close_state.id, actor_id, epoch)


def _auto_close_parent_chain(issue, actor_id, epoch):
    """Walk up the parent chain: if a parent's project wants auto-close and
    ALL of that parent's sub-issues are now completed/cancelled, close the
    parent too - which may in turn qualify its own parent, and so on."""
    current = issue
    for _ in range(MAX_PARENT_CHAIN_DEPTH):
        if not current.parent_id:
            return

        parent = Issue.issue_objects.filter(pk=current.parent_id).select_related("project", "state").first()
        if parent is None or (parent.state is not None and parent.state.group in CLOSED_STATE_GROUPS):
            return

        parent_project = parent.project
        if not parent_project.sub_issue_auto_close:
            return

        remaining_open = (
            Issue.issue_objects.filter(parent_id=parent.id).exclude(state__group__in=CLOSED_STATE_GROUPS).exists()
        )
        if remaining_open:
            return

        close_state = _resolve_close_state(parent_project)
        if close_state is None:
            return

        parent.state = close_state
        parent.save(update_fields=["state"])
        _log_auto_close(parent.id, parent.project_id, close_state.id, actor_id, epoch)

        current = parent


def handle_sub_issue_automations(issue, actor_id):
    """Call after `issue`'s new state has already been persisted. Cheap no-op
    if the issue isn't in a completed/cancelled state group or if neither
    automation is enabled on the relevant project(s)."""
    issue.refresh_from_db(fields=["state_id", "parent_id"])
    if issue.state is None or issue.state.group not in CLOSED_STATE_GROUPS:
        return

    epoch = int(timezone.now().timestamp())
    _cascade_close_sub_issues(issue, actor_id, epoch)
    _auto_close_parent_chain(issue, actor_id, epoch)
