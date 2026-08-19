# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Celery wiring for category 9 feature 1 - "Auto-triage assiste par IA"
(docs/feature-specs/09-ai-features.md in plane-selfhost). The actual logic
lives in `plane.utils.issue_triage_suggestion`, which never raises - the
try/except here is pure defense in depth, same shape as
`plane.bgtasks.issue_embedding_task.compute_issue_embedding_task`.

`generate_issue_triage_suggestion_task` is the ONE task both callers use:
  - `IssueViewSet.create` (apps/api/plane/app/views/issue/base.py) fires it
    right after `serializer.save()`, passing `empty_fields_at_creation`
    computed from the raw creation payload (exigence 9, exigence 1 -
    "sans bloquer ni ralentir la reponse").
  - `IssueTriageSuggestionRegenerateEndpoint` (exigence 15) fires it with
    `empty_fields=None`, which makes the underlying
    `generate_issue_triage_suggestion` fall back to
    `compute_currently_empty_fields` (the live-issue-state generalization
    of exigence 9 - see that module's docstring).
"""

import logging

from celery import shared_task

from plane.utils.exception_logger import log_exception

logger = logging.getLogger(__name__)


@shared_task
def generate_issue_triage_suggestion_task(issue_id, empty_fields=None):
    from plane.db.models import Issue
    from plane.utils.issue_triage_suggestion import generate_issue_triage_suggestion

    try:
        issue = Issue.objects.select_related("workspace", "project").filter(id=issue_id).first()
        if issue is None:
            return
        generate_issue_triage_suggestion(issue, empty_fields=empty_fields)
    except Exception as e:
        log_exception(e)
