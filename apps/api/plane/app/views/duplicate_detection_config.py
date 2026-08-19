# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 2 - "Detection de doublons/similarite" settings +
backfill-trigger endpoints. Backs the flat config fields added directly to
`Project`/`Workspace` (see those models' own docstrings) - matching this
fork's `is_ai_triage_enabled` convention (`plane.app.views.ai_triage_config`)
rather than the spec's own `WorkspaceAIFeatureConfig` satellite model.

`GET`/`PATCH /workspaces/<slug>/projects/<project_id>/duplicate-detection-config/`
  - Admin only, both verbs (settings endpoints in this codebase are
  consistently Admin-gated even for reads).
`GET`/`PATCH /workspaces/<slug>/duplicate-detection-config/` - Admin only,
  workspace-level.
`POST /workspaces/<slug>/duplicate-detection-config/backfill/` - Admin only,
  rate-limited (`DuplicateDetectionBackfillThrottle`). Enqueues the SAME
  underlying batch task `manage.py backfill_issue_embeddings` already uses
  (`plane.bgtasks.issue_embedding_task.backfill_issue_embeddings_batch`) -
  no separate/duplicated batching logic, just a thin admin-triggerable
  wrapper for a UI button (a raw management command isn't reachable from
  the web UI).
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.bgtasks.issue_embedding_task import backfill_issue_embeddings_batch
from plane.db.models import DuplicateDetectionScope, Project, Workspace
from plane.throttles.issue_duplicate_detection import DuplicateDetectionBackfillThrottle

from .base import BaseAPIView


def _serialize_project_duplicate_detection_config(project) -> dict:
    return {
        "is_duplicate_detection_enabled": project.is_duplicate_detection_enabled,
        "workspace_master_switch_enabled": project.workspace.is_duplicate_detection_enabled,
    }


def _serialize_workspace_duplicate_detection_config(workspace) -> dict:
    return {
        "is_duplicate_detection_enabled": workspace.is_duplicate_detection_enabled,
        "duplicate_detection_similarity_threshold": workspace.duplicate_detection_similarity_threshold,
        "duplicate_detection_scope": workspace.duplicate_detection_scope,
    }


class ProjectDuplicateDetectionConfigEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_project_duplicate_detection_config(project), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)

        if "is_duplicate_detection_enabled" in request.data:
            value = request.data["is_duplicate_detection_enabled"]
            # `None`/`null` restores the "inherit the workspace master
            # switch" tri-state - same convention as
            # ProjectAITriageConfigEndpoint.patch.
            project.is_duplicate_detection_enabled = None if value is None else bool(value)
            project.save(update_fields=["is_duplicate_detection_enabled", "updated_at"])

        return Response(_serialize_project_duplicate_detection_config(project), status=status.HTTP_200_OK)


class WorkspaceDuplicateDetectionConfigEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_workspace_duplicate_detection_config(workspace), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        update_fields = []

        if "is_duplicate_detection_enabled" in data:
            workspace.is_duplicate_detection_enabled = bool(data["is_duplicate_detection_enabled"])
            update_fields.append("is_duplicate_detection_enabled")

        if "duplicate_detection_similarity_threshold" in data:
            try:
                threshold = float(data["duplicate_detection_similarity_threshold"])
            except (TypeError, ValueError):
                return Response(
                    {"error": "'duplicate_detection_similarity_threshold' must be a number between 0 and 1."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not 0.0 <= threshold <= 1.0:
                return Response(
                    {"error": "'duplicate_detection_similarity_threshold' must be between 0 and 1."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            workspace.duplicate_detection_similarity_threshold = threshold
            update_fields.append("duplicate_detection_similarity_threshold")

        if "duplicate_detection_scope" in data:
            scope = data["duplicate_detection_scope"]
            if scope not in DuplicateDetectionScope.values:
                return Response(
                    {"error": f"'duplicate_detection_scope' must be one of {DuplicateDetectionScope.values}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            workspace.duplicate_detection_scope = scope
            update_fields.append("duplicate_detection_scope")

        if update_fields:
            workspace.save(update_fields=update_fields + ["updated_at"])

        return Response(_serialize_workspace_duplicate_detection_config(workspace), status=status.HTTP_200_OK)


class WorkspaceDuplicateDetectionBackfillEndpoint(BaseAPIView):
    def get_throttles(self):
        return [DuplicateDetectionBackfillThrottle()]

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        batch_size = int(request.data.get("batch_size", 200))
        countdown = int(request.data.get("countdown", 60))

        backfill_issue_embeddings_batch.delay(
            batch_size=batch_size,
            offset=0,
            countdown=countdown,
            workspace_slug=slug,
            project_id=None,
        )

        return Response(
            {"detail": f"Issue embedding backfill scheduled for workspace '{slug}'."},
            status=status.HTTP_202_ACCEPTED,
        )
