# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Sentry outbound sync - see docs/feature-specs/07-integrations-git.md
("5. Integration Sentry native", exigence 5/7/12) in plane-selfhost.

Dispatched from the single choke point in
`plane.bgtasks.issue_activities_task.issue_activity` (the same choke
point the SLA and workflow-rule engines already use for "issue changed,
react accordingly" side effects - see that module) whenever an issue's
state changes, gated by `integration_sync_origin != "sentry"`. That gate
is the anti-echo guard (exigence 7): the inbound Sentry webhook handler
(`plane.utils.sentry_inbound`) tags every state change *it* makes with
`integration_sync_origin="sentry"`, so a Sentry-triggered Plane state
change never re-enters this task and calls back out to Sentry - and
conversely, `sentry_inbound` never calls this task or the Sentry API
itself, so the reverse direction has no loop to guard against either.

Manual retry (not `autoretry_for`) mirrors the existing precedent in
`plane.bgtasks.webhook_task.webhook_send_task` - both need per-attempt
logging to a durable table (here: `IntegrationEventLog`) even on final
failure, which `autoretry_for`'s automatic retry loop doesn't give a hook
for.
"""

from celery import shared_task
from django.utils import timezone

from plane.db.models import (
    Issue,
    IntegrationEventDirection,
    IntegrationEventLog,
    IntegrationProvider,
    IssueSentryDetail,
    SentrySyncStatus,
    StateGroup,
)
from plane.utils.exception_logger import log_exception
from plane.utils.sentry_client import SentryAPIError, update_issue_status


def _log(detail, event_type, response_status=None, error_message=None):
    IntegrationEventLog.objects.create(
        workspace_id=detail.workspace_id,
        provider=IntegrationProvider.SENTRY,
        connector_id=detail.project_sync.connection_id if detail.project_sync else None,
        direction=IntegrationEventDirection.OUTBOUND,
        event_type=event_type,
        payload={"sentry_issue_id": detail.sentry_issue_id},
        response_status=str(response_status) if response_status is not None else None,
        error_message=error_message,
    )


@shared_task(bind=True, max_retries=3)
def sync_issue_state_to_sentry(self, issue_id):
    detail = None
    desired_status = None
    try:
        issue = Issue.objects.filter(pk=issue_id).select_related("state").first()
        if issue is None:
            return

        detail = (
            IssueSentryDetail.objects.filter(issue_id=issue_id)
            .select_related("project_sync", "project_sync__connection")
            .first()
        )
        if detail is None or detail.project_sync is None or not detail.is_sync_active:
            return

        project_sync = detail.project_sync
        connection = project_sync.connection
        if connection is None or not connection.is_active:
            return
        # Exigence 5 - "Ce comportement (auto_resolve) est activable/
        # désactivable par mapping projet" - a single toggle governs both
        # the resolved and ignored outbound outcomes (the spec names only
        # one boolean for this, not two).
        if not project_sync.auto_resolve:
            return

        state_group = issue.state.group if issue.state else None
        if state_group == StateGroup.COMPLETED.value:
            desired_status = SentrySyncStatus.RESOLVED
        elif state_group == StateGroup.CANCELLED.value:
            desired_status = SentrySyncStatus.IGNORED
        else:
            return  # no relevant transition (exigence 5's own scope)

        if detail.status == desired_status:
            # Defensive idempotency - not explicitly required for the
            # Sentry direction by the spec, but mirrors the Support
            # connector's own explicit REQ10 ("idempotente et
            # défensive") for the same shape of problem.
            return

        update_issue_status(
            connection.base_url, connection.org_slug, detail.sentry_issue_id, desired_status, connection.api_token
        )
    except SentryAPIError as e:
        _log(detail, f"issue.{desired_status}", response_status=e.status_code, error_message=e.message)
        if self.request.retries >= self.max_retries:
            IssueSentryDetail.objects.filter(pk=detail.id).update(
                last_outbound_sync_status="error", last_sync_error=e.message
            )
            return
        self.retry(exc=e, countdown=2**self.request.retries * 10)
    except Exception as e:
        log_exception(e)
    else:
        _log(detail, f"issue.{desired_status}", response_status=200)
        IssueSentryDetail.objects.filter(pk=detail.id).update(
            status=desired_status,
            last_synced_at=timezone.now(),
            last_outbound_sync_status="success",
            last_sync_error=None,
        )
