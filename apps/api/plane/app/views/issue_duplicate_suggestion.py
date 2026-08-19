# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Endpoints for category 9 (AI features, docs/feature-specs/09-ai-features.md
in plane-selfhost), feature 2 - "Detection de doublons/similarite". See
`plane.db.models.issue_duplicate_suggestion` for the model and
`plane.utils.issue_duplicate_detection` for the generation/scoring/
resolution logic.

`POST .../projects/<project_id>/issues/duplicate-check/` - live "draft"
  check (exigence 1), any project member including Guest (read-only
  candidate search, same visibility rule as `IssueTriageSuggestionEndpoint`).
  Always 200 (exigence 12 - graceful degradation, never a 500 on embedding
  failure).
`GET .../issues/<issue_id>/duplicate-suggestions/` - `pending` suggestions
  for an existing issue, any project member including Guest.
`POST .../issues/<issue_id>/duplicate-suggestions/<suggestion_id>/dismiss/`
  - Member/Admin only (mutating action, same RBAC as triage's resolve/).
`POST .../issues/<issue_id>/duplicate-suggestions/<suggestion_id>/confirm/`
  - Member/Admin only. Body `{"relation_type": "duplicate"|"relates_to"}`.
"""

from django.utils import timezone
from django.utils.html import strip_tags
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueDuplicateSuggestionSerializer
from plane.db.models import IssueDuplicateSuggestion, IssueDuplicateSuggestionStatus, Project, Workspace
from plane.utils.issue_duplicate_detection import (
    check_draft_for_duplicates,
    confirm_duplicate_suggestion,
    get_active_project_ids_for_user,
)

from .base import BaseAPIView

_TERMINAL_STATUSES = (
    IssueDuplicateSuggestionStatus.CONFIRMED_DUPLICATE,
    IssueDuplicateSuggestionStatus.CONFIRMED_RELATED,
)


class IssueDuplicateCheckEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)

        title = (request.data.get("title") or "").strip()
        # "description" is expected as already-plain text (matching the
        # spec's own literal `{title, description}` body) - `strip_tags` is
        # still applied defensively (a no-op on already-plain text) in case
        # a caller forwards raw `description_html` instead, mirroring
        # `Issue.save()`'s own html-to-`description_stripped` conversion.
        description_stripped = strip_tags(request.data.get("description") or "")

        results = check_draft_for_duplicates(project, project.workspace, title, description_stripped, request.user)
        return Response({"results": results}, status=status.HTTP_200_OK)


class IssueDuplicateSuggestionListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 8, defense in depth: even a persisted suggestion never
        # surfaces a candidate from a project the requesting user isn't an
        # active member of, regardless of what project(s) it was generated
        # against at write time (e.g. a workspace-scoped detection run, or a
        # membership revoked since).
        accessible_project_ids = get_active_project_ids_for_user(request.user, workspace)

        suggestions = (
            IssueDuplicateSuggestion.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_id=issue_id,
                status=IssueDuplicateSuggestionStatus.PENDING,
                suggested_issue__project_id__in=accessible_project_ids,
            )
            .select_related("suggested_issue")
            .order_by("-similarity_score")
        )
        return Response(IssueDuplicateSuggestionSerializer(suggestions, many=True).data, status=status.HTTP_200_OK)


class IssueDuplicateSuggestionDismissEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, suggestion_id):
        suggestion = IssueDuplicateSuggestion.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=suggestion_id
        ).first()
        if suggestion is None:
            return Response({"error": "Suggestion not found."}, status=status.HTTP_404_NOT_FOUND)

        if suggestion.status in _TERMINAL_STATUSES:
            return Response(
                {"error": "This suggestion has already been resolved."}, status=status.HTTP_400_BAD_REQUEST
            )

        suggestion.status = IssueDuplicateSuggestionStatus.DISMISSED
        suggestion.resolved_by = request.user
        suggestion.resolved_at = timezone.now()
        suggestion.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])

        return Response(IssueDuplicateSuggestionSerializer(suggestion).data, status=status.HTTP_200_OK)


class IssueDuplicateSuggestionConfirmEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, suggestion_id):
        suggestion = (
            IssueDuplicateSuggestion.objects.filter(
                workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=suggestion_id
            )
            .select_related("issue", "suggested_issue")
            .first()
        )
        if suggestion is None:
            return Response({"error": "Suggestion not found."}, status=status.HTTP_404_NOT_FOUND)

        if suggestion.status in _TERMINAL_STATUSES:
            return Response(
                {"error": "This suggestion has already been resolved."}, status=status.HTTP_400_BAD_REQUEST
            )

        relation_type = request.data.get("relation_type")
        if relation_type not in ("duplicate", "relates_to"):
            return Response(
                {"error": "'relation_type' must be 'duplicate' or 'relates_to'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        relation = confirm_duplicate_suggestion(suggestion, relation_type, actor=request.user)

        suggestion.status = (
            IssueDuplicateSuggestionStatus.CONFIRMED_DUPLICATE
            if relation_type == "duplicate"
            else IssueDuplicateSuggestionStatus.CONFIRMED_RELATED
        )
        suggestion.resolved_by = request.user
        suggestion.resolved_at = timezone.now()
        suggestion.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])

        return Response(
            {
                "suggestion": IssueDuplicateSuggestionSerializer(suggestion).data,
                "relation_id": str(relation.id),
            },
            status=status.HTTP_200_OK,
        )
