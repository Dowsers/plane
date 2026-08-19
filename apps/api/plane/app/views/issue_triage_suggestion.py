# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Endpoints for category 9 (AI features, docs/feature-specs/09-ai-features.md
in plane-selfhost), feature 1 - "Auto-triage assiste par IA". See
`plane.db.models.issue_triage_suggestion` for the model and
`plane.utils.issue_triage_suggestion` for the generation/resolution logic.

`GET .../issues/<issue_id>/ai-triage-suggestion/` - any project member
  including Guest (exigence 5 - read-only visibility for everyone who can
  already see the issue).
`POST .../issues/<issue_id>/ai-triage-suggestion/regenerate/` - Member/
  Admin only (exigence 7/8 - Guest never gets write access here, matching
  the existing RBAC on module/assignee/label edits themselves). Rate-limited
  1/min/issue (exigence 15) and blocked outright for an issue in a terminal
  state group (`completed`/`cancelled`). Always async - generation (which
  may call an external embedding provider) never runs inline in the
  request/response cycle, same reasoning as `IssueCommentSummaryEndpoint`.
`POST .../issues/<issue_id>/ai-triage-suggestion/resolve/` - Member/Admin
  only. Body: `{"action": "accept"|"reject", "fields": [...]}`, partial
  resolution supported (exigence 7). Revalidates before applying (exigence
  11) - never a 500, a stale candidate just lands in `expired_fields` and
  flips the whole row `EXPIRED`.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueTriageSuggestionSerializer
from plane.bgtasks.issue_triage_suggestion_task import generate_issue_triage_suggestion_task
from plane.db.models import Issue, IssueTriageSuggestion, IssueTriageSuggestionStatus
from plane.db.models.state import StateGroup
from plane.throttles.issue_triage_suggestion import IssueTriageSuggestionRegenerateThrottle
from plane.utils.issue_triage_suggestion import (
    FIELDS,
    is_ai_triage_enabled_for_project,
    resolve_suggestion_fields,
)

from .base import BaseAPIView

_TERMINAL_STATE_GROUPS = {StateGroup.COMPLETED.value, StateGroup.CANCELLED.value}


class IssueTriageSuggestionEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        suggestion = IssueTriageSuggestion.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).first()
        if suggestion is None:
            return Response(
                {"error": "No AI triage suggestion exists for this issue yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(IssueTriageSuggestionSerializer(suggestion).data, status=status.HTTP_200_OK)


class IssueTriageSuggestionRegenerateEndpoint(BaseAPIView):
    def get_throttles(self):
        return [IssueTriageSuggestionRegenerateThrottle()]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = (
            Issue.objects.filter(id=issue_id, project_id=project_id, workspace__slug=slug)
            .select_related("state", "project", "workspace")
            .first()
        )
        if issue is None:
            return Response({"error": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        if issue.state_id and issue.state.group in _TERMINAL_STATE_GROUPS:
            return Response(
                {"error": "AI triage suggestions cannot be regenerated for an issue in a terminal state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not is_ai_triage_enabled_for_project(issue.project, workspace=issue.workspace):
            return Response(
                {"error": "AI-assisted auto-triage is not enabled for this project."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # empty_fields=None -> the task falls back to
        # compute_currently_empty_fields (live-issue-state generalization
        # of exigence 9 for regeneration, see
        # plane.utils.issue_triage_suggestion module docstring).
        generate_issue_triage_suggestion_task.delay(issue_id=str(issue.id), empty_fields=None)

        existing = IssueTriageSuggestion.objects.filter(issue_id=issue_id).first()
        return Response(
            {
                "detail": "AI triage suggestion regeneration queued.",
                "suggestion": IssueTriageSuggestionSerializer(existing).data if existing else None,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class IssueTriageSuggestionResolveEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        suggestion = IssueTriageSuggestion.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).first()
        if suggestion is None:
            return Response(
                {"error": "No AI triage suggestion exists for this issue."}, status=status.HTTP_404_NOT_FOUND
            )

        if suggestion.status == IssueTriageSuggestionStatus.EXPIRED:
            return Response(
                {"error": "This suggestion has expired. Please regenerate before resolving it."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        action = request.data.get("action")
        if action not in ("accept", "reject"):
            return Response({"error": "'action' must be 'accept' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)

        fields = request.data.get("fields")
        if not fields or not isinstance(fields, list) or not all(f in FIELDS for f in fields):
            return Response(
                {"error": f"'fields' must be a non-empty list from {sorted(FIELDS)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue = Issue.objects.filter(id=issue_id, project_id=project_id).select_related("project", "workspace").first()
        if issue is None:
            return Response({"error": "Issue not found."}, status=status.HTTP_404_NOT_FOUND)

        applied, rejected, expired = resolve_suggestion_fields(
            suggestion, issue, issue.project, action=action, fields=fields, actor=request.user
        )

        return Response(
            {
                "suggestion": IssueTriageSuggestionSerializer(suggestion).data,
                "applied_fields": applied,
                "rejected_fields": rejected,
                "expired_fields": expired,
            },
            status=status.HTTP_200_OK,
        )
