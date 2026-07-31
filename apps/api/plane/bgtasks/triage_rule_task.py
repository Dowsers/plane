# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import IntakeIssue
from plane.utils.exception_logger import log_exception
from plane.utils.triage_rule_engine import apply_matching_rule


@shared_task
def run_triage_rules_for_intake_issue(intake_issue_id, actor_id):
    """
    Async wrapper so triage rule evaluation never blocks the intake
    submission HTTP response - exigence 6 de
    docs/feature-specs/02-cycles-intake.md ("Moteur de règles de triage
    conditionnelles") in plane-selfhost.
    """
    try:
        intake_issue = IntakeIssue.objects.select_related("issue").filter(id=intake_issue_id).first()
        if intake_issue is None:
            return
        apply_matching_rule(intake_issue, actor_id)
    except Exception as e:
        log_exception(e)
