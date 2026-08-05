# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Celery tasks for SLA policies - see
docs/feature-specs/06-automation-workflow-sla.md ("Politiques de SLA",
section 2) in plane-selfhost. `sync_issue_sla` is dispatched from the
single choke point in plane/bgtasks/issue_activities_task.py::issue_activity
(exigence 5 - due-date calculation must be asynchronous, never inline in
the create/update request). `recalculate_sla_statuses_task` is the
periodic (5-minute) recalculation (exigence 7), registered in
plane/celery.py, mirroring plane/bgtasks/intake_escalation_task.py's shape.
"""

import json

from celery import shared_task

from plane.utils.exception_logger import log_exception
from plane.utils.sla_engine import create_or_update_sla_entries, recalculate_sla_statuses

# Requested-data keys that can flip which SLA policy (if any) matches an
# issue - see plane.utils.sla_engine.find_matching_policy's match
# criteria (project/priority/labels/assignees/state group). Mirrors the
# key vocabulary plane.bgtasks.issue_activities_task's own
# `update_issue_activity`/`_derive_workflow_rule_triggers` already check
# for the same underlying fields (both the internal `_id`-suffixed keys and
# the external-endpoint aliases).
_SLA_RELEVANT_KEYS = {
    "state_id",
    "state",
    "priority",
    "assignee_ids",
    "assignees",
    "label_ids",
    "labels",
    "project_id",
    "project",
}


def _issue_change_relevant_to_sla(activity_type, requested_data):
    """Whether this `issue_activity` call could plausibly change which SLA
    policy matches the issue - used to avoid dispatching a Celery task on
    every single activity (e.g. a comment or description edit never
    changes SLA matching)."""
    if activity_type == "issue.activity.created":
        return True
    if activity_type != "issue.activity.updated" or not requested_data:
        return False
    try:
        requested = json.loads(requested_data)
    except (TypeError, ValueError):
        return False
    if not isinstance(requested, dict):
        return False
    return any(key in requested for key in _SLA_RELEVANT_KEYS)


@shared_task
def sync_issue_sla(issue_id):
    try:
        from plane.db.models import Issue

        issue = (
            Issue.objects.filter(pk=issue_id)
            .select_related("state", "project")
            .prefetch_related("labels", "assignees")
            .first()
        )
        if issue is None:
            return
        create_or_update_sla_entries(issue)
    except Exception as e:
        log_exception(e)


@shared_task
def recalculate_sla_statuses_task():
    try:
        recalculate_sla_statuses()
    except Exception as e:
        log_exception(e)
