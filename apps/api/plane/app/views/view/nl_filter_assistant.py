# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Deterministic, rule-based natural-language filter assistant endpoints -
see docs/feature-specs/04-views-filters.md ("Assistant de filtre en langage
naturel") in plane-selfhost, and `apps/api/plane/utils/nl_filter_parser.py`
for the actual parsing logic (no LLM call - see that module's docstring and
the feature's patch README for the full scope boundary).
"""

import time

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import NaturalLanguageFilterQuerySerializer
from plane.db.models import (
    Cycle,
    Label,
    Module,
    NaturalLanguageFilterQuery,
    Project,
    ProjectMember,
    State,
    Workspace,
    WorkspaceMember,
)
from plane.utils.nl_filter_parser import parse_natural_language_query
from .. import BaseAPIView


class NLFilterAssistantThrottle(UserRateThrottle):
    """20 requests / 5 minutes per user - see docs/feature-specs/04-views-filters.md
    ("Assistant de filtre en langage naturel"), requirement 11, in
    plane-selfhost. DRF's `SimpleRateThrottle.parse_rate()` only reads a
    single leading digit+unit character (s/m/h/d) from the rate string, so
    there is no built-in syntax for "N per 5 minutes" - `num_requests`/
    `duration` are set directly in `allow_request` instead, bypassing
    `parse_rate` entirely. Mirrors `IntakeFormSubmitThrottle`
    (apps/api/plane/space/views/intake_form.py) for the same reason.
    """

    scope = "nl_filter_assistant"

    def allow_request(self, request, view):
        self.num_requests, self.duration = 20, 300
        return super().allow_request(request, view)


def _project_candidates(project_id):
    """Fuzzy-match candidates scoped strictly to this project - never
    searched across other projects/workspaces (spec requirement 3)."""
    members = list(
        ProjectMember.objects.filter(project_id=project_id, is_active=True, member__isnull=False).values(
            "member_id", "member__display_name", "member__first_name", "member__last_name", "member__email"
        )
    )
    return {
        "members": [
            {
                "id": str(member["member_id"]),
                "display_name": member["member__display_name"],
                "first_name": member["member__first_name"],
                "last_name": member["member__last_name"],
                "email": member["member__email"],
            }
            for member in members
        ],
        "labels": [
            {"id": str(row["id"]), "name": row["name"]}
            for row in Label.objects.filter(project_id=project_id).values("id", "name")
        ],
        "states": [
            {"id": str(row["id"]), "name": row["name"]}
            for row in State.objects.filter(project_id=project_id).values("id", "name")
        ],
        "cycles": [
            {"id": str(row["id"]), "name": row["name"]}
            for row in Cycle.objects.filter(project_id=project_id).values("id", "name")
        ],
        "modules": [
            {"id": str(row["id"]), "name": row["name"]}
            for row in Module.objects.filter(project_id=project_id).values("id", "name")
        ],
    }


def _workspace_candidates(workspace_id):
    """Workspace-scoped requests (e.g. My Issues) only resolve member
    names - label/state/cycle/module names are inherently project-scoped
    concepts in this data model (the same label name can exist with a
    different id in every project), so fuzzy-matching them across an entire
    workspace would risk resolving to the wrong project's entity. Status
    words ("done"/"in progress"/...) still work at workspace scope via the
    language-independent `state_group` keyword matching in the parser,
    which needs no per-project candidate list at all - see the feature's
    patch README for this scope decision.
    """
    members = list(
        WorkspaceMember.objects.filter(workspace_id=workspace_id, is_active=True, member__isnull=False).values(
            "member_id", "member__display_name", "member__first_name", "member__last_name", "member__email"
        )
    )
    return {
        "members": [
            {
                "id": str(member["member_id"]),
                "display_name": member["member__display_name"],
                "first_name": member["member__first_name"],
                "last_name": member["member__last_name"],
                "email": member["member__email"],
            }
            for member in members
        ],
        "labels": [],
        "states": [],
        "cycles": [],
        "modules": [],
    }


def _run_and_log(request, *, workspace_id, project_id, candidates):
    query_text = request.data.get("query")
    if not isinstance(query_text, str):
        return Response({"error": "query is required"}, status=status.HTTP_400_BAD_REQUEST)

    timezone_name = request.data.get("timezone") or getattr(request.user, "user_timezone", None) or "UTC"

    started_at = time.monotonic()
    result = parse_natural_language_query(
        query_text,
        user_id=str(request.user.id),
        candidates=candidates,
        timezone_name=timezone_name,
    )
    latency_ms = int((time.monotonic() - started_at) * 1000)

    # Requirement 14: log every call (status/latency/"provider") without
    # ever storing issue content - only the query text and resulting
    # filter, both of which are already exactly what `result` contains.
    log_entry = NaturalLanguageFilterQuery.objects.create(
        workspace_id=workspace_id,
        project_id=project_id,
        raw_query=query_text,
        detected_language=result["detected_language"],
        resolved_filters=result["filters"],
        restatement=result["restatement"],
        unresolved_terms=result["unresolved_terms"],
        status=result["status"],
        latency_ms=latency_ms,
    )

    return Response(
        {
            "status": result["status"],
            "filters": result["filters"],
            "restatement": result["restatement"],
            "unresolved_terms": result["unresolved_terms"],
            "query_id": str(log_entry.id),
        },
        status=status.HTTP_200_OK,
    )


class ProjectNLFilterAssistantEndpoint(BaseAPIView):
    """Project-scoped natural-language filter parsing - same read-only
    role gate as the project issue list itself (no new permission concept,
    per spec requirement 8)."""

    throttle_classes = [NLFilterAssistantThrottle]

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        return _run_and_log(
            request,
            workspace_id=project.workspace_id,
            project_id=project.id,
            candidates=_project_candidates(project_id),
        )


class WorkspaceNLFilterAssistantEndpoint(BaseAPIView):
    """Workspace-scoped natural-language filter parsing (My Issues,
    workspace-level Views) - same read-only role gate as the workspace
    issue list itself (no new permission concept, per spec requirement 8).
    """

    throttle_classes = [NLFilterAssistantThrottle]

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        return _run_and_log(
            request,
            workspace_id=workspace.id,
            project_id=None,
            candidates=_workspace_candidates(workspace.id),
        )


class NLFilterAssistantRecentEndpoint(BaseAPIView):
    """Last 5 queries by the requesting user in the given project/workspace
    context - surfaced as quick suggestions (spec requirement 13)."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        project_id = request.GET.get("project_id")
        queryset = NaturalLanguageFilterQuery.objects.filter(workspace__slug=slug, created_by=request.user)
        queryset = queryset.filter(project_id=project_id) if project_id else queryset.filter(project__isnull=True)
        recent = queryset.order_by("-created_at")[:5]
        return Response(NaturalLanguageFilterQuerySerializer(recent, many=True).data, status=status.HTTP_200_OK)
