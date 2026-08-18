# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Async wrapper so AI thread-summary generation (category 9,
docs/feature-specs/09-ai-features.md in plane-selfhost, feature 4) never
blocks the triggering HTTP request - same shape as
`plane.bgtasks.triage_rule_task.run_triage_rules_for_intake_issue`. The real
logic lives in `plane.utils.issue_comment_summary.generate_summary_for_issue`,
which already never raises (see its own docstring) - the try/except here is
pure defense in depth so a truly unexpected error (e.g. a DB connectivity
blip) still can't surface as a Celery task failure/retry storm.
"""

from celery import shared_task

from plane.utils.exception_logger import log_exception
from plane.utils.issue_comment_summary import generate_summary_for_issue


@shared_task
def generate_issue_comment_summary(issue_id, actor_id=None):
    try:
        generate_summary_for_issue(issue_id, actor_id=actor_id)
    except Exception as e:
        log_exception(e)
