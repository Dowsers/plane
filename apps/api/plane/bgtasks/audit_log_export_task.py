# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), features 3+5 merged, exigence 11 - CSV export of the
workspace audit log. Reuses this fork's EXISTING export infrastructure
(`ExporterHistory` + `DataExporter` + the same S3 upload helper as
`plane.bgtasks.export_task.issue_export_task`) rather than a new
async-job mechanism - the spec's own "réutilise l'infra d'export
existante de Plane" is real and confirmed (see
`plane.app.views.exporter.base.ExportIssuesEndpoint`/
`plane.bgtasks.export_task` for the pre-existing pattern this follows).
"""

from celery import shared_task

from plane.bgtasks.export_task import create_zip_file, upload_to_s3
from plane.db.models import ExporterHistory, WorkspaceAuditLog
from plane.app.serializers.audit import WorkspaceAuditLogExportSerializer
from plane.utils.audit_log_filters import apply_audit_log_filters
from plane.utils.exception_logger import log_exception
from plane.utils.porters.exporter import DataExporter

# Exigence 11 - "limité à un nombre maximal de lignes (ex. 10 000)".
AUDIT_LOG_EXPORT_ROW_LIMIT = 10_000


@shared_task
def audit_log_export_task(workspace_id, token_id, slug, filters):
    try:
        exporter_instance = ExporterHistory.objects.get(token=token_id)
        exporter_instance.status = "processing"
        exporter_instance.save(update_fields=["status"])

        queryset = apply_audit_log_filters(
            WorkspaceAuditLog.objects.filter(workspace_id=workspace_id).select_related("actor", "target_user"),
            filters or {},
        ).order_by("-created_at")[:AUDIT_LOG_EXPORT_ROW_LIMIT]

        exporter = DataExporter(WorkspaceAuditLogExportSerializer, format_type="csv")
        filename, content = exporter.export(f"audit-log-{slug}", queryset)

        zip_buffer = create_zip_file([(filename, content)])
        upload_to_s3(zip_buffer, workspace_id, token_id, slug)
    except Exception as e:
        exporter_instance = ExporterHistory.objects.get(token=token_id)
        exporter_instance.status = "failed"
        exporter_instance.reason = str(e)
        exporter_instance.save(update_fields=["status", "reason"])
        log_exception(e)
        return
