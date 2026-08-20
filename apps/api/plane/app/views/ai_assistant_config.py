# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 3 - "Assistant de chat IA in-app" settings
endpoints. Backs the flat config fields added directly to `Project`/
`Workspace` (see those models' own docstrings), matching this fork's
established convention (is_ai_triage_enabled/
is_duplicate_detection_enabled/is_digest_llm_enrichment_enabled) rather
than the spec's own `WorkspaceAIConfig`/`ProjectAIConfig` satellite models
(which this feature already reuses from category 9's shared foundation -
see `plane.db.models.ai_config` - for the actual LLM connection, not for
this simple enable/disable toggle).

`GET`/`PATCH /workspaces/<slug>/projects/<project_id>/ai-assistant-config/`
  - Admin only.
`GET`/`PATCH /workspaces/<slug>/ai-assistant-config/` - Admin only,
  workspace-level.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Project, Workspace

from .base import BaseAPIView


def _serialize_project_ai_assistant_config(project) -> dict:
    return {
        "is_ai_assistant_enabled": project.is_ai_assistant_enabled,
        "workspace_master_switch_enabled": project.workspace.is_ai_assistant_enabled,
    }


def _serialize_workspace_ai_assistant_config(workspace) -> dict:
    return {
        "is_ai_assistant_enabled": workspace.is_ai_assistant_enabled,
        "ai_assistant_max_messages_per_user_per_hour": workspace.ai_assistant_max_messages_per_user_per_hour,
    }


class ProjectAIAssistantConfigEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_project_ai_assistant_config(project), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)

        if "is_ai_assistant_enabled" in request.data:
            value = request.data["is_ai_assistant_enabled"]
            # `None`/`null` explicitly restores the "inherit the workspace
            # master switch" tri-state - same convention as
            # ai_triage_config.
            project.is_ai_assistant_enabled = None if value is None else bool(value)
            project.save(update_fields=["is_ai_assistant_enabled", "updated_at"])

        return Response(_serialize_project_ai_assistant_config(project), status=status.HTTP_200_OK)


class WorkspaceAIAssistantConfigEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_workspace_ai_assistant_config(workspace), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        update_fields = []
        if "is_ai_assistant_enabled" in request.data:
            workspace.is_ai_assistant_enabled = bool(request.data["is_ai_assistant_enabled"])
            update_fields.append("is_ai_assistant_enabled")

        if "ai_assistant_max_messages_per_user_per_hour" in request.data:
            try:
                limit = max(int(request.data["ai_assistant_max_messages_per_user_per_hour"]), 0)
            except (TypeError, ValueError):
                return Response(
                    {"error": "'ai_assistant_max_messages_per_user_per_hour' must be an integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            workspace.ai_assistant_max_messages_per_user_per_hour = limit
            update_fields.append("ai_assistant_max_messages_per_user_per_hour")

        if update_fields:
            workspace.save(update_fields=update_fields + ["updated_at"])

        return Response(_serialize_workspace_ai_assistant_config(workspace), status=status.HTTP_200_OK)
