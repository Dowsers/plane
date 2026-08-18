# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Celery wiring for the shared embedding pipeline - a category 9 (AI
features, docs/feature-specs/09-ai-features.md in plane-selfhost)
INFRASTRUCTURE PREREQUISITE for feature 1 (auto-triage) and feature 2
(duplicate detection). The actual logic lives in
`plane.utils.issue_embedding`, which already never raises
(`compute_or_refresh_issue_embedding` returns `None` on any failure) - the
try/except here is pure defense in depth, same shape as
`plane.bgtasks.issue_comment_summary_task.generate_issue_comment_summary`.

NOT WIRED IN YET: `compute_issue_embedding_task` is deliberately not called
from `IssueViewSet.create`/`partial_update` (apps/api/plane/app/views/issue/
base.py) - that wiring belongs to feature 1/2's own implementation, which
will call this task conditionally on their own feature-specific enable
flags. This module just makes the task callable and correct in isolation.

BACKFILL: `backfill_issue_embeddings_batch` follows the exact
self-rescheduling batch shape of
`plane.bgtasks.issue_version_sync.sync_issue_version` - a stable,
`created_at`-ordered `Issue` base queryset sliced by `offset`/`batch_size`,
each batch enqueuing per-issue work then rescheduling itself via
`apply_async(countdown=...)` for the next slice until the whole queryset
has been walked. Required later by feature 2's own spec (exigence 11) but
lives here since it's pipeline-level, not feature-specific.
"""

import logging

from celery import shared_task

from plane.utils.exception_logger import log_exception

logger = logging.getLogger(__name__)


@shared_task
def compute_issue_embedding_task(issue_id):
    from plane.db.models import Issue
    from plane.utils.issue_embedding import compute_or_refresh_issue_embedding

    try:
        issue = Issue.objects.select_related("workspace", "project").filter(id=issue_id).first()
        if issue is None:
            return
        compute_or_refresh_issue_embedding(issue)
    except Exception as e:
        log_exception(e)


@shared_task
def backfill_issue_embeddings_batch(batch_size=200, offset=0, countdown=60, workspace_slug=None, project_id=None):
    """Processes one batch of (up to) `batch_size` issues starting at
    `offset` in a stable, `created_at`-ordered queryset. For each issue
    missing an `IssueEmbedding` or whose stored `content_hash` is stale,
    enqueues `compute_issue_embedding_task`. Reschedules itself for the
    next batch after `countdown` seconds - a large backfill against an
    external embedding-provider API must not fire every issue's embedding
    call at once.
    """
    try:
        from plane.db.models import Issue
        from plane.utils.issue_embedding import compute_content_hash

        base_query = Issue.objects.filter(is_draft=False)
        if workspace_slug:
            base_query = base_query.filter(workspace__slug=workspace_slug)
        if project_id:
            base_query = base_query.filter(project_id=project_id)

        total_count = base_query.count()
        if total_count == 0 or offset >= total_count:
            return

        end_offset = min(offset + batch_size, total_count)
        issues_batch = list(
            base_query.order_by("created_at").select_related("embedding")[offset:end_offset]
        )

        enqueued = 0
        for issue in issues_batch:
            existing = getattr(issue, "embedding", None)
            current_hash = compute_content_hash(issue.name, issue.description_stripped)
            if existing is None or existing.content_hash != current_hash:
                compute_issue_embedding_task.delay(issue.id)
                enqueued += 1

        if end_offset < total_count:
            backfill_issue_embeddings_batch.apply_async(
                kwargs={
                    "batch_size": batch_size,
                    "offset": end_offset,
                    "countdown": countdown,
                    "workspace_slug": workspace_slug,
                    "project_id": project_id,
                },
                countdown=countdown,
            )

        logger.info(
            "Issue embedding backfill: enqueued %s of %s issues in batch [%s:%s]",
            enqueued,
            len(issues_batch),
            offset,
            end_offset,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def schedule_backfill_issue_embeddings(batch_size=200, countdown=60, workspace_slug=None, project_id=None):
    backfill_issue_embeddings_batch.delay(
        batch_size=int(batch_size),
        offset=0,
        countdown=int(countdown),
        workspace_slug=workspace_slug,
        project_id=project_id,
    )
