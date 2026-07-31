# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Duplicate-relation data migration - see
docs/feature-specs/01-core-issue-tracking.md ("Migration des données lors
du marquage Duplicate") in plane-selfhost for the full spec.

Triggered explicitly from IssueRelationViewSet.create() when a "duplicate"
relation is created (not a signal, matching the rest of the codebase's
convention). By construction of that endpoint, `relation.issue` is always
the issue the user was on when marking it a duplicate (the "loser"), and
`relation.related_issue` is the chosen original (the "survivor") - see that
view for the exact FK-direction logic this relies on.
"""

import json

from celery import shared_task
from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import FileAsset, Issue, IssueComment, IssueRelation, IssueSubscriber
from plane.utils.exception_logger import log_exception


@shared_task
def duplicate_issue_data_migration_task(relation_id, actor_id):
    try:
        relation = (
            IssueRelation.objects.filter(pk=relation_id, relation_type="duplicate")
            .select_related("issue", "related_issue")
            .first()
        )
        if relation is None:
            return

        source = relation.issue
        target = relation.related_issue

        IssueRelation.objects.filter(pk=relation_id).update(
            data_migration_status=IssueRelation.DataMigrationStatus.IN_PROGRESS
        )

        # 1. Comments: reassign to the target issue (and its project, in case
        # source/target are cross-project). Direct .update() to avoid
        # re-triggering IssueComment's Description-sync save() override.
        IssueComment.objects.filter(issue_id=source.id).update(
            issue_id=target.id,
            project_id=target.project_id,
            workspace_id=target.workspace_id,
            moved_from_issue_id=source.id,
        )

        # 2. Attachments: re-point the FK only - the stored file itself
        # (FileAsset.asset) never moves, so there is no re-upload.
        FileAsset.objects.filter(issue_id=source.id, entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT).update(
            issue_id=target.id,
            project_id=target.project_id,
            moved_from_issue_id=source.id,
        )

        # 3. Subscribers: merge (respecting the unique constraint on
        # (issue, subscriber)) rather than blindly reassigning, since the
        # target issue may already have some of the same subscribers. Also
        # auto-subscribe the source's creator and assignees onto the target,
        # so people who cared about the duplicate don't lose visibility.
        subscriber_ids = set(IssueSubscriber.objects.filter(issue_id=source.id).values_list("subscriber_id", flat=True))
        if source.created_by_id:
            subscriber_ids.add(source.created_by_id)
        subscriber_ids.update(source.assignees.values_list("id", flat=True))

        for subscriber_id in subscriber_ids:
            IssueSubscriber.objects.get_or_create(
                issue_id=target.id,
                subscriber_id=subscriber_id,
                defaults={
                    "project_id": target.project_id,
                    "workspace_id": target.workspace_id,
                },
            )

        IssueRelation.objects.filter(pk=relation_id).update(
            data_migration_status=IssueRelation.DataMigrationStatus.COMPLETED,
            data_migrated_at=timezone.now(),
        )

        issue_activity.delay(
            type="issue_relation.activity.created",
            requested_data=json.dumps({"duplicate_data_migrated_from": str(source.id)}),
            actor_id=str(actor_id),
            issue_id=str(target.id),
            project_id=str(target.project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
        )
    except Exception as e:
        log_exception(e)
        IssueRelation.objects.filter(pk=relation_id).update(data_migration_status=IssueRelation.DataMigrationStatus.FAILED)
