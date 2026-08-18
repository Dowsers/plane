# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 6 - "Redaction assistee des mises a jour de
statut" (AI-assisted status update drafting).

SCOPE, already decided, not to be re-litigated: PROJECT ONLY for v1 - see
`plane.utils.project_update_ai_draft` module docstring for why (no
CycleUpdate/ModuleUpdate model exists in this fork). Nothing in this module
touches Cycle or Module.

Generation is fully synchronous within the request - not a Celery task with
polling as the spec's own "Considerations API/UX" section suggests. The
underlying LLM call has a hard 20s timeout (exigence 10, see
`plane.utils.workspace_ai.call_llm`'s `timeout` kwarg), so a single
request/response round trip is sufficient; a polling job would add
complexity without real benefit here.

Per this feature's scope decision (`ProjectUpdate` has no draft/publish
distinction - `ProjectUpdateViewSet.create()` IS publication, firing a
notification immediately): this endpoint NEVER creates a `ProjectUpdate`
row. It only returns generated draft text + a suggested status for the
frontend to show, pre-filled, in the EXISTING manual creation form. The
human still publishes through the existing, unmodified
`POST .../updates/` endpoint (now with `is_ai_assisted`/`ai_draft_content`/
etc. wired onto `ProjectUpdateWriteSerializer` - see
`plane.app.serializers.project_update`). A completely separate, unmodified
code path handles manual (non-AI) update creation regardless of anything in
this module - an LLM failure here can never affect it.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import AIGenerationLogSerializer
from plane.db.models import AIGenerationLog, Project
from plane.throttles.project_update_ai_draft import ProjectUpdateAIDraftThrottle
from plane.utils.project_update_ai_draft import (
    generate_project_update_draft,
    increment_regeneration_count,
    peek_regeneration_count,
)
from plane.utils.workspace_ai import get_workspace_ai_config

from ..base import BaseAPIView


class ProjectUpdateAIDraftEndpoint(BaseAPIView):
    """`POST /api/workspaces/<slug>/projects/<project_id>/updates/draft/` -
    same Member/Admin permission as manual `ProjectUpdate` creation
    (exigence 2, `ProjectUpdateViewSet.create`)."""

    def get_throttles(self):
        # Only the generation-triggering POST calls an LLM / costs money -
        # nothing else lives on this endpoint.
        if self.request.method == "POST":
            return [ProjectUpdateAIDraftThrottle()]
        return []

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if project.archived_at is not None:
            return Response(
                {"error": "Archived projects cannot receive new updates"}, status=status.HTTP_400_BAD_REQUEST
            )

        workspace = project.workspace

        # Exigence 3 - disabled by default at the workspace level.
        if not workspace.is_ai_update_draft_enabled:
            return Response(
                {"error": "AI-assisted update drafting is not enabled for this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ai_config = get_workspace_ai_config(workspace)
        if ai_config is None or not ai_config.is_enabled:
            return Response(
                {
                    "error": "AI is not configured for this workspace. Ask a workspace "
                    "admin to configure it in Settings > AI."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Exigence 9 - regeneration cap per unpublished draft-editing cycle.
        # See plane.utils.project_update_ai_draft module docstring for the
        # cache-key-per-publish-cycle mechanism.
        cap = workspace.max_ai_update_regenerations
        current_count = peek_regeneration_count(project)
        if current_count >= cap:
            return Response(
                {
                    "error": f"Regeneration limit reached ({cap} generations per draft, before "
                    "publishing). Publish the current draft, or start a new one after publishing."
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        result = generate_project_update_draft(project=project, workspace=workspace, user=request.user)
        new_count = increment_regeneration_count(project)

        if result["error"]:
            # Exigence 10 - never a 500; the frontend falls back to an empty
            # manual form on any error shape from this endpoint.
            return Response({"error": result["error"]}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(
            {
                "draft_content": result["draft_content"],
                "suggested_status": result["suggested_status"],
                "ai_generation_status": result["ai_generation_status"],
                "ai_generation_metadata": result["ai_generation_metadata"],
                "ai_source_snapshot": result["ai_source_snapshot"],
                "regeneration_count": new_count,
                "max_regenerations": cap,
            },
            status=status.HTTP_200_OK,
        )


class ProjectUpdateAIGenerationLogEndpoint(BaseAPIView):
    """`GET /api/workspaces/<slug>/projects/<project_id>/ai-update-logs/` -
    Admin-only paginated audit trail (exigence 13)."""

    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        queryset = (
            AIGenerationLog.objects.filter(workspace__slug=slug, project_id=project_id)
            .select_related("triggered_by")
            .order_by("-created_at")
        )
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda data: AIGenerationLogSerializer(data, many=True).data,
        )
