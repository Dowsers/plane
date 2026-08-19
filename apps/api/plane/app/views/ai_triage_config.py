# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 1 - "Auto-triage assiste par IA" settings
endpoints. Backs the flat config fields added directly to `Project`/
`Workspace` (see those models' own docstrings) rather than the spec's own
`ProjectAITriageConfig`/`WorkspaceAITriageConfig` satellite models -
matching this fork's established is_initiatives_enabled/is_roadmap_enabled/
is_flexible_query_enabled/is_ai_summary_enabled convention.

`GET`/`PATCH /workspaces/<slug>/projects/<project_id>/ai-triage-config/` -
  Admin only (spec's own "role requis: Admin" for this endpoint, applied to
  both verbs - settings endpoints in this codebase are consistently
  Admin-gated even for reads, e.g. `WorkspaceAIConfigEndpoint`).
`GET`/`PATCH /workspaces/<slug>/ai-triage-config/` - Admin only,
  workspace-level (there is no separate "Owner" role in this codebase's
  `ROLE` enum - `ROLE.ADMIN` at `level="WORKSPACE"` already is the
  Admin/Owner gate every sibling workspace-level AI settings endpoint uses,
  e.g. `WorkspaceAIConfigEndpoint`).

Both PATCH handlers only ever touch fields explicitly present in the
request body (partial update), matching `WorkspaceAIConfigEndpoint.patch`'s
own convention.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Project, Workspace

from .base import BaseAPIView

_PROJECT_BOOL_FIELDS = ("ai_triage_auto_apply_module", "ai_triage_auto_apply_assignee", "ai_triage_auto_apply_labels")
_PROJECT_THRESHOLD_FIELDS = (
    "ai_triage_confidence_threshold_module",
    "ai_triage_confidence_threshold_assignee",
    "ai_triage_confidence_threshold_labels",
)


def _serialize_project_ai_triage_config(project) -> dict:
    data = {"is_ai_triage_enabled": project.is_ai_triage_enabled}
    for field in _PROJECT_BOOL_FIELDS:
        data[field] = getattr(project, field)
    for field in _PROJECT_THRESHOLD_FIELDS:
        data[field] = getattr(project, field)
    data["ai_triage_max_labels_suggested"] = project.ai_triage_max_labels_suggested
    data["ai_triage_min_historical_issues"] = project.ai_triage_min_historical_issues
    data["workspace_master_switch_enabled"] = project.workspace.is_ai_triage_enabled
    return data


def _serialize_workspace_ai_triage_config(workspace) -> dict:
    return {"is_ai_triage_enabled": workspace.is_ai_triage_enabled}


class ProjectAITriageConfigEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_project_ai_triage_config(project), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)

        data = request.data

        if "is_ai_triage_enabled" in data:
            value = data["is_ai_triage_enabled"]
            # Exigence 12 - `None`/`null` explicitly restores the "inherit
            # the workspace master switch" tri-state.
            project.is_ai_triage_enabled = None if value is None else bool(value)

        for field in _PROJECT_BOOL_FIELDS:
            if field in data:
                setattr(project, field, bool(data[field]))

        for field in _PROJECT_THRESHOLD_FIELDS:
            if field in data:
                try:
                    threshold = float(data[field])
                except (TypeError, ValueError):
                    return Response(
                        {"error": f"'{field}' must be a number between 0 and 1."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not 0.0 <= threshold <= 1.0:
                    return Response(
                        {"error": f"'{field}' must be between 0 and 1."}, status=status.HTTP_400_BAD_REQUEST
                    )
                setattr(project, field, threshold)

        if "ai_triage_max_labels_suggested" in data:
            try:
                project.ai_triage_max_labels_suggested = max(int(data["ai_triage_max_labels_suggested"]), 0)
            except (TypeError, ValueError):
                return Response(
                    {"error": "'ai_triage_max_labels_suggested' must be an integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if "ai_triage_min_historical_issues" in data:
            try:
                project.ai_triage_min_historical_issues = max(int(data["ai_triage_min_historical_issues"]), 0)
            except (TypeError, ValueError):
                return Response(
                    {"error": "'ai_triage_min_historical_issues' must be an integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        project.save()
        return Response(_serialize_project_ai_triage_config(project), status=status.HTTP_200_OK)


class WorkspaceAITriageConfigEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_workspace_ai_triage_config(workspace), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        if "is_ai_triage_enabled" in request.data:
            workspace.is_ai_triage_enabled = bool(request.data["is_ai_triage_enabled"])
            workspace.save(update_fields=["is_ai_triage_enabled", "updated_at"])

        return Response(_serialize_workspace_ai_triage_config(workspace), status=status.HTTP_200_OK)
