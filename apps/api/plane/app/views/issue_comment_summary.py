# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Endpoints for category 9 (AI features, docs/feature-specs/09-ai-features.md
in plane-selfhost), feature 4 - "Resume IA de fils de discussion" (AI thread
summary). See `plane.db.models.issue_comment_summary` for the model/scope
decisions and `plane.utils.issue_comment_summary` for the generation logic.

`POST`/`GET`/`DELETE .../issues/<issue_id>/ai-summary/`:
  - `POST` (Member/Admin only, exigence 7) - triggers generation. Gated on
    the workspace toggle, an enabled `WorkspaceAIConfig`, and a minimum
    comment count (exigence 1). Idempotent: an already-`PENDING` generation
    is returned as-is rather than starting a second one. Rate-limited
    (exigence 13) via `IssueCommentSummaryThrottle`.
  - `GET` (any project member including Guest, exigence 4/7 - read-only) -
    returns the cached summary, or 404 if none exists yet.
  - `DELETE` (Admin only) - clears the cached summary. The spec's own
    endpoint list marks this Admin-only; kept as-is here since nothing in
    the exigences suggests Member should be able to wipe a summary Member
    itself is allowed to regenerate freely via POST anyway.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueCommentSummarySerializer
from plane.bgtasks.issue_comment_summary_task import generate_issue_comment_summary
from plane.db.models import (
    Issue,
    IssueComment,
    IssueCommentSummary,
    IssueCommentSummaryStatus,
    Workspace,
)
from plane.throttles.issue_comment_summary import IssueCommentSummaryThrottle
from plane.utils.issue_comment_summary import MIN_COMMENTS_FOR_SUMMARY
from plane.utils.workspace_ai import get_workspace_ai_config

from .base import BaseAPIView


class IssueCommentSummaryEndpoint(BaseAPIView):
    def get_throttles(self):
        # Only the generation-triggering POST is rate-limited - GET/DELETE
        # are cheap reads/cache-clears, not LLM calls.
        if self.request.method == "POST":
            return [IssueCommentSummaryThrottle()]
        return []

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        summary = IssueCommentSummary.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).first()
        if summary is None:
            return Response(
                {"error": "No summary has been generated for this issue yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(IssueCommentSummarySerializer(summary).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 6 - the feature must be explicitly enabled at the
        # workspace level before any data ever reaches an LLM.
        if not workspace.is_ai_summary_enabled:
            return Response(
                {"error": "AI thread summary is not enabled for this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Exigence 8 - no LLM provider configured -> the button should be
        # disabled client-side, but the server enforces it regardless.
        ai_config = get_workspace_ai_config(workspace)
        if ai_config is None or not ai_config.is_enabled:
            return Response(
                {
                    "error": "AI is not configured for this workspace. Ask a workspace "
                    "admin to configure it in Settings > AI."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Exigence 1 - only issues with enough comments are worth summarizing.
        comment_count = IssueComment.objects.filter(issue_id=issue_id, project_id=project_id).count()
        if comment_count < MIN_COMMENTS_FOR_SUMMARY:
            return Response(
                {
                    "error": f"This issue needs at least {MIN_COMMENTS_FOR_SUMMARY} comments "
                    "to generate a summary."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = IssueCommentSummary.objects.filter(issue_id=issue_id, project_id=project_id).first()
        if existing is not None and existing.status == IssueCommentSummaryStatus.PENDING:
            # Idempotent - a generation is already in flight for this issue,
            # return it instead of starting a second one.
            return Response(IssueCommentSummarySerializer(existing).data, status=status.HTTP_202_ACCEPTED)

        issue = Issue.objects.filter(id=issue_id, project_id=project_id).first()
        if issue is None:
            return Response({"error": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 12 - regenerating replaces the cached summary outright,
        # no history kept. Stale content from a previous generation is
        # cleared immediately so a FAILED status is never shown alongside
        # leftover text from an older, unrelated summary.
        summary, _ = IssueCommentSummary.objects.update_or_create(
            issue=issue,
            defaults={
                "project_id": project_id,
                "status": IssueCommentSummaryStatus.PENDING,
                "error_message": None,
                "summary_text": "",
                "citations": [],
                "source_comment_count": 0,
                "source_comments_hash": "",
                "model_used": "",
                "generated_by": None,
                "generated_at": None,
            },
        )

        generate_issue_comment_summary.delay(issue_id=str(issue_id), actor_id=str(request.user.id))

        return Response(IssueCommentSummarySerializer(summary).data, status=status.HTTP_202_ACCEPTED)

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, issue_id):
        summary = IssueCommentSummary.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).first()
        if summary is None:
            return Response({"error": "No summary exists for this issue."}, status=status.HTTP_404_NOT_FOUND)
        summary.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
