# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Module imports
from plane.utils.exception_logger import log_exception
from plane.utils.workflow_rule_engine import evaluate_rules_for_issue


@shared_task
def evaluate_workflow_rules(issue_id, trigger_type, trigger_snapshot=None, actor_id=None, chain_depth=0):
    """
    Async wrapper so workflow rule evaluation never blocks the request/task
    that produced the triggering issue event - mirrors
    bgtasks/triage_rule_task.py. Dispatched from the single choke point in
    bgtasks/issue_activities_task.py's `issue_activity` task (root-level
    events, chain_depth=0) and, recursively, from
    plane/utils/workflow_rule_engine.py's `evaluate_rules_for_issue` itself
    (cascaded events caused by a rule's own actions, chain_depth + 1) - see
    docs/feature-specs/06-automation-workflow-sla.md ("Moteur de regles
    d'automatisation") in plane-selfhost.
    """
    try:
        evaluate_rules_for_issue(
            issue_id=issue_id,
            trigger_type=trigger_type,
            trigger_snapshot=trigger_snapshot,
            actor_id=actor_id,
            chain_depth=chain_depth,
        )
    except Exception as e:
        log_exception(e)
