# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ExporterHistorySerializer
from plane.bgtasks.issue_worklog_export_task import issue_worklog_export_task
from plane.db.models import ExporterHistory, Workspace
from plane.utils.reauth import guard_sensitive_action


class WorklogExportEndpoint(BaseAPIView):
    """
    POST /api/workspaces/<slug>/worklogs/export/ - docs/feature-specs/
    14-pricing-gap-remediation.md ("14a. Time Tracking and Work Logs",
    feature 2, exigence 5) in plane-selfhost. Creates an ExporterHistory row
    of the previously-orphaned type "issue_worklogs" and dispatches the
    async CSV generation task. Existing GET .../exports/<exporter_id>/
    endpoint (unchanged) is reused as-is for status polling/download.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        # Same "export complet des donnees" sensitive-action gate as the
        # existing issue export endpoint (ExportIssuesEndpoint).
        blocked = guard_sensitive_action(request.user, workspace=workspace)
        if blocked:
            return blocked

        project_ids = request.data.get("project_id", [])
        filters = {
            "project_ids": project_ids,
            "logged_by_ids": request.data.get("member_id", []),
            "date_from": request.data.get("date_from"),
            "date_to": request.data.get("date_to"),
        }

        exporter = ExporterHistory.objects.create(
            workspace=workspace,
            project=project_ids or None,
            initiated_by=request.user,
            provider="csv",
            type="issue_worklogs",
            filters=filters,
        )

        issue_worklog_export_task.delay(
            workspace_id=workspace.id,
            token_id=exporter.token,
            slug=slug,
            filters=filters,
        )

        return Response(
            {"message": "Once the export is ready you will be able to download it", "id": exporter.id},
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        # Status/download listing, same idiom as ExportIssuesEndpoint.get -
        # the frontend polls this (filtered to type="issue_worklogs") until
        # `status == "completed"` and then follows `url`.
        exporter_history = ExporterHistory.objects.filter(
            workspace__slug=slug, type="issue_worklogs", initiated_by=request.user
        ).select_related("workspace", "initiated_by")

        if request.GET.get("per_page", False) and request.GET.get("cursor", False):
            return self.paginate(
                order_by=request.GET.get("order_by", "-created_at"),
                request=request,
                queryset=exporter_history,
                on_results=lambda exporter_history: ExporterHistorySerializer(exporter_history, many=True).data,
            )
        else:
            return Response(
                {"error": "per_page and cursor are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
