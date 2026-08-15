# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Celery task for the Figma outbound status-sync fallback - see
docs/feature-specs/07-integrations-git.md ("4. Plugin Figma", exigence 6
and 13) in plane-selfhost, docker/api/figma-integration/README.md.

Exigence 6's primary path (poll from the canvas widget within <=30s) is
served by the status-batch endpoint (plane/api/views/figma.py) and needs
no worker task - the widget pulls state itself. This task is the
documented best-effort FALLBACK for when nobody has the file open: it
posts a plain Figma comment on the linked node announcing the new state.
Retried with exponential backoff per exigence 13, capped at 3 attempts,
matching the retry shape already established by this fork's other
outbound-integration tasks.
"""

from celery import shared_task
from django.utils import timezone

from plane.db.models import FigmaFileLink, FigmaSyncLog, FigmaWorkspaceConnection
from plane.utils.exception_logger import log_exception
from plane.utils.figma_client import FigmaAPIError, post_comment


@shared_task(bind=True, max_retries=3)
def push_figma_status_comment(self, file_link_id, state_name, state_group):
    file_link = (
        FigmaFileLink.objects.filter(pk=file_link_id, sync_status_enabled=True)
        .select_related("issue", "workspace")
        .first()
    )
    if file_link is None:
        return

    connection = FigmaWorkspaceConnection.objects.filter(
        workspace_id=file_link.workspace_id, is_active=True
    ).first()
    if connection is None:
        # Exigence 2 - a disconnected workspace connection means no
        # outbound Figma calls should be attempted; the file_link's own
        # sync_status_enabled would normally already be False in this
        # case (see FigmaWorkspaceConnectionEndpoint.delete), but this
        # check is defensive in case of a race.
        return

    message = f'Plane: {file_link.issue.name} is now "{state_name}" ({state_group}).'

    try:
        post_comment(connection.access_token, file_link.figma_file_key, message)
    except FigmaAPIError as e:
        FigmaSyncLog.objects.create(
            project_id=file_link.project_id,
            workspace_id=file_link.workspace_id,
            file_link=file_link,
            direction="plane_to_figma",
            payload={"state_name": state_name, "state_group": state_group},
            success=False,
            error_message=str(e),
        )
        file_link.last_sync_error = str(e)
        file_link.save(update_fields=["last_sync_error"])
        try:
            raise self.retry(exc=e, countdown=2**self.request.retries)
        except self.MaxRetriesExceededError:
            log_exception(e)
        return
    except Exception as e:
        # Network-level failure (timeout, DNS, connection reset) - same
        # retry/backoff treatment as a Figma-side 4xx/5xx.
        try:
            raise self.retry(exc=e, countdown=2**self.request.retries)
        except self.MaxRetriesExceededError:
            log_exception(e)
        return

    FigmaSyncLog.objects.create(
        project_id=file_link.project_id,
        workspace_id=file_link.workspace_id,
        file_link=file_link,
        direction="plane_to_figma",
        payload={"state_name": state_name, "state_group": state_group},
        success=True,
    )
    file_link.last_synced_at = timezone.now()
    file_link.last_sync_error = None
    file_link.save(update_fields=["last_synced_at", "last_sync_error"])
