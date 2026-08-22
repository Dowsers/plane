# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), features 3+5 merged - the workspace-scoped audit log
read/export surface.

Read-access policy (decision #2): Owner-only, not "any Admin" - feature
3 proposed Admin-readable, feature 5 proposed Owner-exclusive; feature
5's stricter rule wins for the merged model. Built on `IsWorkspaceOwner`
(decision #4), not a scattered inline check.
"""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import IsWorkspaceOwner
from plane.app.serializers import WorkspaceAuditLogSerializer
from plane.app.serializers.audit import WorkspaceAuditLogListSerializer
from plane.app.views.base import BaseAPIView
from plane.bgtasks.audit_log_export_task import audit_log_export_task
from plane.db.models import ExporterHistory, Workspace, WorkspaceAuditLog
from plane.utils.audit_log_filters import apply_audit_log_filters


class WorkspaceAuditLogViewSet(BaseAPIView):
    """
    GET /api/workspaces/<slug>/audit-logs/           - paginated list (cursor)
    GET /api/workspaces/<slug>/audit-logs/<pk>/       - full detail

    Exigence 13 - every queryset filters by `workspace_id` resolved from
    the URL `slug` alone; there is no code path here that can be steered
    by a query param into returning another workspace's rows.
    """

    permission_classes = [IsWorkspaceOwner]

    def get_queryset(self, slug):
        return apply_audit_log_filters(
            WorkspaceAuditLog.objects.filter(workspace__slug=slug).select_related("actor", "target_user"),
            self.request.GET,
        )

    def get(self, request, slug, pk=None):
        if pk is not None:
            audit_log = WorkspaceAuditLog.objects.filter(workspace__slug=slug, pk=pk).select_related(
                "actor", "target_user"
            ).first()
            if audit_log is None:
                return Response({"error": "Audit log entry not found"}, status=status.HTTP_404_NOT_FOUND)
            serializer = WorkspaceAuditLogSerializer(audit_log)
            return Response(serializer.data, status=status.HTTP_200_OK)

        queryset = self.get_queryset(slug)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda audit_logs: WorkspaceAuditLogListSerializer(audit_logs, many=True).data,
        )


class WorkspaceAuditLogExportEndpoint(BaseAPIView):
    """
    POST /api/workspaces/<slug>/audit-logs/export/

    Exigence 11 - async CSV export (reuses the pre-existing
    `ExporterHistory` infra), capped at
    `plane.bgtasks.audit_log_export_task.AUDIT_LOG_EXPORT_ROW_LIMIT` rows,
    applying whatever filters were active on the request - the exact
    same filters the list endpoint above understands, via the shared
    `apply_audit_log_filters` helper, so the two can never silently
    diverge. Result is listed like any other export in Workspace
    Settings > Exports (`GET .../export-issues/` for the equivalent
    "issue_exports" list endpoint - `type="audit_log_exports"` here).
    """

    permission_classes = [IsWorkspaceOwner]

    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        filters = {
            "event_type": request.data.get("event_type", []),
            "actor": request.data.get("actor"),
            "target_user": request.data.get("target_user"),
            "date_from": request.data.get("date_from"),
            "date_to": request.data.get("date_to"),
        }

        exporter = ExporterHistory.objects.create(
            workspace=workspace,
            initiated_by=request.user,
            provider="csv",
            type="audit_log_exports",
            filters=filters,
        )

        audit_log_export_task.delay(
            workspace_id=str(workspace.id),
            token_id=exporter.token,
            slug=slug,
            filters=filters,
        )

        return Response(
            {"message": "Once the export is ready you will be able to download it"},
            status=status.HTTP_200_OK,
        )
