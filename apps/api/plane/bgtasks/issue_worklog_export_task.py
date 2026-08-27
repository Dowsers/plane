# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
Work Logs", feature 2 "Timesheets historiques et rapports agrégés",
exigence 5-7) in plane-selfhost - connects the previously-orphaned
`ExporterHistory.type == "issue_worklogs"` choice to a real CSV export,
reusing this fork's existing export infrastructure (`ExporterHistory` +
`DataExporter` + the same S3 upload helper as
`plane.bgtasks.export_task.issue_export_task`), following the identical
precedent already established by `plane.bgtasks.audit_log_export_task` for
category 11's audit log export.
"""

from celery import shared_task

from plane.bgtasks.export_task import create_zip_file, upload_to_s3
from plane.app.serializers.issue_worklog import IssueWorklogExportSerializer
from plane.db.models import ExporterHistory, IssueWorklog
from plane.utils.exception_logger import log_exception
from plane.utils.porters.exporter import DataExporter


@shared_task
def issue_worklog_export_task(workspace_id, token_id, slug, filters):
    try:
        exporter_instance = ExporterHistory.objects.get(token=token_id)
        exporter_instance.status = "processing"
        exporter_instance.save(update_fields=["status"])

        filters = filters or {}
        queryset = IssueWorklog.objects.filter(workspace_id=workspace_id).select_related(
            "project", "issue", "logged_by"
        )

        project_ids = filters.get("project_ids")
        if project_ids:
            queryset = queryset.filter(project_id__in=project_ids)

        logged_by_ids = filters.get("logged_by_ids")
        if logged_by_ids:
            queryset = queryset.filter(logged_by_id__in=logged_by_ids)

        date_from = filters.get("date_from")
        if date_from:
            queryset = queryset.filter(logged_at__gte=date_from)

        date_to = filters.get("date_to")
        if date_to:
            queryset = queryset.filter(logged_at__lte=date_to)

        queryset = queryset.order_by("-logged_at", "-created_at")

        exporter = DataExporter(IssueWorklogExportSerializer, format_type="csv")
        filename, content = exporter.export(f"worklogs-{slug}", queryset)

        zip_buffer = create_zip_file([(filename, content)])
        upload_to_s3(zip_buffer, workspace_id, token_id, slug)
    except Exception as e:
        exporter_instance = ExporterHistory.objects.get(token=token_id)
        exporter_instance.status = "failed"
        exporter_instance.reason = str(e)
        exporter_instance.save(update_fields=["status", "reason"])
        log_exception(e)
        return
