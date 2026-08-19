# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Celery wiring for category 9 (AI features, docs/feature-specs/09-ai-
features.md in plane-selfhost), feature 2 - "Detection de doublons/
similarite". The actual logic lives in
`plane.utils.issue_duplicate_detection.process_issue_for_duplicate_detection`,
which already never raises - the try/except here is pure defense in depth,
same shape as `plane.bgtasks.issue_embedding_task`/
`plane.bgtasks.issue_triage_suggestion_task`.

Called unconditionally from `IssueViewSet.create`/`partial_update` (apps/
api/plane/app/views/issue/base.py) - exigence 1 (creation) and exigence 7
(material title/description edit), always async so an embedding-provider
call never runs inline in the request/response cycle (exigence 1's "sans
jamais bloquer la soumission").
"""

import logging

from celery import shared_task

from plane.utils.exception_logger import log_exception

logger = logging.getLogger(__name__)


@shared_task
def generate_issue_duplicate_suggestions_task(issue_id, actor_id=None):
    from plane.db.models import Issue, User
    from plane.utils.issue_duplicate_detection import process_issue_for_duplicate_detection

    try:
        issue = Issue.objects.select_related("workspace", "project").filter(id=issue_id).first()
        if issue is None:
            return
        actor = User.objects.filter(id=actor_id).first() if actor_id else None
        process_issue_for_duplicate_detection(issue, actor=actor)
    except Exception as e:
        log_exception(e)
