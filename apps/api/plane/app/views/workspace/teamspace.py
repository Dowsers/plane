# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Category 13 (docs/feature-specs/13-teamspaces.md in plane-selfhost) -
# same style as `plane.app.views.workspace.team` (the pre-existing,
# deliberately separate/parallel Team feature): BaseViewSet for the main
# Teamspace CRUD, BaseAPIView for the members/projects sub-resources.
#
# Feature 1 (entite + membres) is the CRUD below. Feature 2 (dashboard
# agregue) is the four read-only aggregation endpoints
# (overview/cycles/relations/stats) at the bottom of this file - all of
# them derive their `project_ids` scope from `TeamspaceProject` and then
# intersect it with the projects the requesting user can actually see via
# `ProjectMember`, per spec section 2 exigence 6 ("un work item d'un
# projet auquel l'utilisateur courant n'a pas acces en lecture n'apparait
# dans aucune agregation").

from django.db.models import Count, Q
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.permissions.workspace import Admin as WORKSPACE_ADMIN
from plane.app.serializers import (
    TeamspaceSerializer,
    TeamspaceDetailSerializer,
    TeamspaceMemberSerializer,
    TeamspaceProjectSerializer,
    TeamspacePageSerializer,
    TeamspaceViewSerializer,
    RecurringIssueTemplateSerializer,
)
from plane.db.models import (
    Cycle,
    Issue,
    IssueRelation,
    Page,
    ProjectMember,
    RecurringIssueTemplate,
    Teamspace,
    TeamspaceMember,
    TeamspaceProject,
    TeamspaceView,
    Workspace,
    WorkspaceMember,
    TEAMSPACE_LEAD,
)


def _is_workspace_admin(user, slug):
    return WorkspaceMember.objects.filter(
        member=user, workspace__slug=slug, role=WORKSPACE_ADMIN, is_active=True
    ).exists()


def _is_teamspace_lead(user, teamspace_id):
    return TeamspaceMember.objects.filter(
        teamspace_id=teamspace_id,
        member=user,
        role=TEAMSPACE_LEAD,
        deleted_at__isnull=True,
    ).exists()


def _can_manage_teamspace(user, slug, teamspace_id):
    """Spec section 1, exigence 2: write access (rename, description,
    icon, attached-project list, member management) is reserved to
    workspace Admins and the Teamspace's own Leads."""
    return _is_workspace_admin(user, slug) or _is_teamspace_lead(user, teamspace_id)


def _accessible_project_ids(user, slug, teamspace_id):
    """Spec section 2, exigence 6 - every aggregation endpoint below must
    intersect the Teamspace's attached projects with the projects the
    requesting user actually has `ProjectMember` access to, even when the
    project is formally attached to the Teamspace."""
    attached_project_ids = TeamspaceProject.objects.filter(
        teamspace_id=teamspace_id,
        teamspace__workspace__slug=slug,
        deleted_at__isnull=True,
    ).values_list("project_id", flat=True)

    accessible_project_ids = ProjectMember.objects.filter(
        project_id__in=attached_project_ids,
        member=user,
        is_active=True,
        deleted_at__isnull=True,
    ).values_list("project_id", flat=True)

    return list(accessible_project_ids)


class WorkspaceTeamspacesEndpoint(BaseViewSet):
    """Teamspace CRUD endpoint for internal app API"""

    permission_classes = [WorkspaceEntityPermission]
    serializer_class = TeamspaceSerializer
    model = Teamspace

    def get_queryset(self):
        queryset = Teamspace.objects.filter(
            workspace__slug=self.kwargs.get("slug"), deleted_at__isnull=True
        ).select_related("workspace")

        # Spec section 1, exigence 9 - filtered by membership by default,
        # with an admin-only `?all=true` escape hatch.
        show_all = self.request.GET.get("all", "false").lower() == "true"
        if show_all and _is_workspace_admin(self.request.user, self.kwargs.get("slug")):
            return queryset

        member_teamspace_ids = TeamspaceMember.objects.filter(
            member=self.request.user, deleted_at__isnull=True
        ).values_list("teamspace_id", flat=True)
        return queryset.filter(id__in=member_teamspace_ids)

    def list(self, request, slug):
        """List Teamspaces in workspace (filtered by membership unless ?all=true and Admin)"""
        teamspaces = self.get_queryset()
        serializer = TeamspaceSerializer(teamspaces, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug):
        """Create a new Teamspace - spec section 1, exigence 2: creation is Admin-only"""
        if not _is_workspace_admin(request.user, slug):
            return Response(
                {"error": "Only workspace admins can create a teamspace."},
                status=status.HTTP_403_FORBIDDEN,
            )

        workspace = Workspace.objects.get(slug=slug)
        serializer = TeamspaceSerializer(data=request.data)
        if serializer.is_valid():
            teamspace = serializer.save(workspace=workspace, created_by=request.user)
            # Spec section 1, exigence 4 - a teamspace must always have at
            # least one Lead; the creator starts as Lead.
            TeamspaceMember.objects.create(
                teamspace=teamspace,
                member=request.user,
                role=TEAMSPACE_LEAD,
                created_by=request.user,
            )
            return Response(TeamspaceSerializer(teamspace).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, pk):
        """Get Teamspace details with members and projects"""
        try:
            teamspace = Teamspace.objects.get(pk=pk, workspace__slug=slug, deleted_at__isnull=True)
            serializer = TeamspaceDetailSerializer(teamspace)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, slug, pk):
        """Update Teamspace - Admins and the Teamspace's own Leads only (spec section 1, exigence 2)"""
        try:
            teamspace = Teamspace.objects.get(pk=pk, workspace__slug=slug, deleted_at__isnull=True)
            if not _can_manage_teamspace(request.user, slug, teamspace.id):
                return Response(
                    {"error": "Only workspace admins or teamspace leads can update this teamspace."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer = TeamspaceSerializer(teamspace, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, slug, pk):
        """Delete Teamspace (soft delete) - workspace Admins only (spec section 1, exigence 7)"""
        try:
            teamspace = Teamspace.objects.get(pk=pk, workspace__slug=slug, deleted_at__isnull=True)
            if not _is_workspace_admin(request.user, slug):
                return Response(
                    {"error": "Only workspace admins can delete a teamspace."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            teamspace.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)


class WorkspaceTeamspaceMembersEndpoint(BaseAPIView):
    """Teamspace members endpoint"""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id):
        """List Teamspace members"""
        members = TeamspaceMember.objects.filter(
            teamspace_id=teamspace_id, teamspace__workspace__slug=slug, deleted_at__isnull=True
        ).select_related("member")
        serializer = TeamspaceMemberSerializer(members, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, slug, teamspace_id):
        """Add member to Teamspace - Admins and Teamspace Leads only"""
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
            if not _can_manage_teamspace(request.user, slug, teamspace.id):
                return Response(
                    {"error": "Only workspace admins or teamspace leads can manage members."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer = TeamspaceMemberSerializer(data=request.data)
            if serializer.is_valid():
                member = serializer.save(teamspace=teamspace, created_by=request.user)
                return Response(TeamspaceMemberSerializer(member).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, slug, teamspace_id, member_id):
        """Change a Teamspace member's role - Admins and Teamspace Leads only"""
        try:
            member = TeamspaceMember.objects.get(
                pk=member_id, teamspace_id=teamspace_id, teamspace__workspace__slug=slug, deleted_at__isnull=True
            )
            if not _can_manage_teamspace(request.user, slug, teamspace_id):
                return Response(
                    {"error": "Only workspace admins or teamspace leads can manage members."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer = TeamspaceMemberSerializer(member, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except TeamspaceMember.DoesNotExist:
            return Response({"error": "Teamspace member not found"}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, slug, teamspace_id, member_id):
        """Remove member from Teamspace - Admins and Teamspace Leads only.
        Spec section 1, exigence 4 - blocks removing the last remaining Lead."""
        try:
            member = TeamspaceMember.objects.get(
                pk=member_id, teamspace_id=teamspace_id, teamspace__workspace__slug=slug, deleted_at__isnull=True
            )
            if not _can_manage_teamspace(request.user, slug, teamspace_id):
                return Response(
                    {"error": "Only workspace admins or teamspace leads can manage members."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if member.role == TEAMSPACE_LEAD:
                other_leads = (
                    TeamspaceMember.objects.filter(
                        teamspace_id=teamspace_id, role=TEAMSPACE_LEAD, deleted_at__isnull=True
                    )
                    .exclude(pk=member.pk)
                    .exists()
                )
                if not other_leads:
                    return Response(
                        {"error": "A teamspace must always have at least one Lead. Promote another member first."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            member.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except TeamspaceMember.DoesNotExist:
            return Response({"error": "Teamspace member not found"}, status=status.HTTP_404_NOT_FOUND)


class WorkspaceTeamspaceProjectsEndpoint(BaseAPIView):
    """Teamspace projects endpoint"""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id):
        """List Teamspace projects"""
        projects = TeamspaceProject.objects.filter(
            teamspace_id=teamspace_id, teamspace__workspace__slug=slug, deleted_at__isnull=True
        ).select_related("project")
        serializer = TeamspaceProjectSerializer(projects, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, slug, teamspace_id):
        """Attach a project to a Teamspace - Admins and Teamspace Leads only.
        Spec section 1, exigence 3+5: never touches `ProjectMember`."""
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
            if not _can_manage_teamspace(request.user, slug, teamspace.id):
                return Response(
                    {"error": "Only workspace admins or teamspace leads can manage attached projects."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer = TeamspaceProjectSerializer(data=request.data)
            if serializer.is_valid():
                project_link = serializer.save(teamspace=teamspace, created_by=request.user)
                return Response(TeamspaceProjectSerializer(project_link).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, slug, teamspace_id, project_id):
        """Detach a project from a Teamspace - Admins and Teamspace Leads only.
        Spec section 1, exigence 6: never deletes/archives the underlying project."""
        try:
            project_link = TeamspaceProject.objects.get(
                pk=project_id, teamspace_id=teamspace_id, teamspace__workspace__slug=slug, deleted_at__isnull=True
            )
            if not _can_manage_teamspace(request.user, slug, teamspace_id):
                return Response(
                    {"error": "Only workspace admins or teamspace leads can manage attached projects."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            project_link.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except TeamspaceProject.DoesNotExist:
            return Response({"error": "Teamspace project not found"}, status=status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Feature 2 - Team overview (dashboard/cycles/relations/stats), spec section
# 2 "Considerations API/UX". All four endpoints are read-only aggregations
# over existing models (Issue/Cycle/IssueRelation/State), scoped to
# `_accessible_project_ids` (TeamspaceProject intersected with the
# requesting user's ProjectMember access - spec exigence 6).
# ---------------------------------------------------------------------------


class WorkspaceTeamspaceOverviewEndpoint(BaseAPIView):
    """GET .../teamspaces/<id>/overview/ - summary panel + overdue count +
    progress chart data (spec section 2, exigence 1-2)."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id):
        try:
            Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        project_ids = _accessible_project_ids(request.user, slug, teamspace_id)
        if not project_ids:
            # Spec exigence 8 - explicit empty state, no permission error.
            return Response(
                {
                    "summary": {"backlog": 0, "unstarted": 0, "started": 0, "completed": 0, "cancelled": 0, "no_due_date": 0},
                    "overdue_count": 0,
                    "progress_chart": [],
                },
                status=status.HTTP_200_OK,
            )

        issues = Issue.issue_objects.filter(workspace__slug=slug, project_id__in=project_ids)

        summary = issues.aggregate(
            backlog=Count("id", filter=Q(state__group="backlog")),
            unstarted=Count("id", filter=Q(state__group="unstarted")),
            started=Count("id", filter=Q(state__group="started")),
            completed=Count("id", filter=Q(state__group="completed")),
            cancelled=Count("id", filter=Q(state__group="cancelled")),
            no_due_date=Count("id", filter=Q(target_date__isnull=True)),
        )

        overdue_count = issues.filter(
            target_date__lt=timezone.now().date(),
        ).exclude(state__group__in=["completed", "cancelled"]).count()

        group_by = request.GET.get("group_by", "priority")
        group_field = {
            "priority": "priority",
            "due_date": "target_date",
            "start_date": "start_date",
        }.get(group_by, "priority")

        progress_chart = list(
            issues.values(group_field)
            .annotate(
                pending=Count("id", filter=~Q(state__group__in=["completed", "cancelled"])),
                completed=Count("id", filter=Q(state__group="completed")),
            )
            .order_by(group_field)
        )

        return Response(
            {
                "summary": summary,
                "overdue_count": overdue_count,
                "progress_chart": progress_chart,
                "group_by": group_by,
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceTeamspaceOverdueIssuesEndpoint(BaseAPIView):
    """GET .../teamspaces/<id>/overdue-issues/ - the individual work items
    behind the overview endpoint's `overdue_count` (same scope/filters), so
    the "N overdue" banner can link to something real instead of the
    overview page itself."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id):
        try:
            Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        project_ids = _accessible_project_ids(request.user, slug, teamspace_id)
        if not project_ids:
            return Response({"results": []}, status=status.HTTP_200_OK)

        issues = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id__in=project_ids,
                target_date__lt=timezone.now().date(),
            )
            .exclude(state__group__in=["completed", "cancelled"])
            .select_related("project", "state")
            .order_by("target_date")
        )

        results = [
            {
                "id": str(issue.id),
                "name": issue.name,
                "sequence_id": issue.sequence_id,
                "priority": issue.priority,
                "target_date": issue.target_date,
                "project_id": str(issue.project_id),
                "project_identifier": issue.project.identifier,
                "state_group": issue.state.group if issue.state else None,
            }
            for issue in issues
        ]

        return Response({"results": results}, status=status.HTTP_200_OK)


class WorkspaceTeamspaceCyclesEndpoint(BaseAPIView):
    """GET .../teamspaces/<id>/cycles/ - cycles of every attached project,
    grouped by status (spec section 2, exigence 3)."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id):
        try:
            Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        project_ids = _accessible_project_ids(request.user, slug, teamspace_id)
        if not project_ids:
            return Response({"active": [], "upcoming": [], "completed": []}, status=status.HTTP_200_OK)

        now = timezone.now()
        cycles = Cycle.objects.filter(workspace__slug=slug, project_id__in=project_ids).select_related("project")

        def serialize(cycle):
            return {
                "id": str(cycle.id),
                "name": cycle.name,
                "project_id": str(cycle.project_id),
                "project_name": cycle.project.name,
                "start_date": cycle.start_date,
                "end_date": cycle.end_date,
            }

        active = [serialize(c) for c in cycles.filter(start_date__lte=now, end_date__gte=now)]
        upcoming = [serialize(c) for c in cycles.filter(start_date__gt=now)]
        completed = [serialize(c) for c in cycles.filter(end_date__lt=now)]

        return Response({"active": active, "upcoming": upcoming, "completed": completed}, status=status.HTTP_200_OK)


class WorkspaceTeamspaceRelationsEndpoint(BaseAPIView):
    """GET .../teamspaces/<id>/relations/?direction=blocking|blocked - work
    items in scope that block/are blocked by others (spec section 2,
    exigence 4). Reuses `IssueRelation` as-is, no new table."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id):
        try:
            Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        project_ids = _accessible_project_ids(request.user, slug, teamspace_id)
        if not project_ids:
            return Response({"results": []}, status=status.HTTP_200_OK)

        direction = request.GET.get("direction", "blocking")

        if direction == "blocked":
            # In-scope issues that ARE blocked_by another issue.
            relations = IssueRelation.objects.filter(
                relation_type="blocked_by",
                issue__project_id__in=project_ids,
                issue__workspace__slug=slug,
            ).select_related("issue", "related_issue")
        else:
            # In-scope issues that block another issue - i.e. they are the
            # `related_issue` of a "blocked_by" relation.
            relations = IssueRelation.objects.filter(
                relation_type="blocked_by",
                related_issue__project_id__in=project_ids,
                related_issue__workspace__slug=slug,
            ).select_related("issue", "related_issue")

        results = [
            {
                "id": str(rel.id),
                "issue_id": str(rel.issue_id),
                "issue_name": rel.issue.name,
                "related_issue_id": str(rel.related_issue_id),
                "related_issue_name": rel.related_issue.name,
            }
            for rel in relations
        ]

        return Response({"results": results, "direction": direction}, status=status.HTTP_200_OK)


class WorkspaceTeamspaceStatsEndpoint(BaseAPIView):
    """GET .../teamspaces/<id>/stats/?group_by=project|member|state_group|dependency|due_by
    - treemap breakdown data (spec section 2, exigence 5)."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id):
        try:
            Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        project_ids = _accessible_project_ids(request.user, slug, teamspace_id)
        if not project_ids:
            return Response({"results": []}, status=status.HTTP_200_OK)

        group_by = request.GET.get("group_by", "project")
        issues = Issue.issue_objects.filter(workspace__slug=slug, project_id__in=project_ids)

        if group_by == "member":
            data = list(
                issues.values("assignees__id", "assignees__display_name").annotate(count=Count("id", distinct=True))
            )
        elif group_by == "state_group":
            data = list(issues.values("state__group").annotate(count=Count("id")))
        elif group_by == "dependency":
            blocking_ids = set(
                IssueRelation.objects.filter(relation_type="blocked_by", related_issue__project_id__in=project_ids)
                .values_list("related_issue_id", flat=True)
            )
            blocked_ids = set(
                IssueRelation.objects.filter(relation_type="blocked_by", issue__project_id__in=project_ids).values_list(
                    "issue_id", flat=True
                )
            )
            total = issues.count()
            both = len(blocking_ids & blocked_ids)
            data = [
                {"dependency": "blocking", "count": len(blocking_ids - blocked_ids)},
                {"dependency": "blocked", "count": len(blocked_ids - blocking_ids)},
                {"dependency": "blocking_and_blocked", "count": both},
                {"dependency": "none", "count": total - len(blocking_ids | blocked_ids)},
            ]
        elif group_by == "due_by":
            today = timezone.now().date()
            data = [
                {
                    "due_by": "on_time",
                    "count": issues.filter(target_date__gte=today).exclude(state__group__in=["completed", "cancelled"]).count(),
                },
                {
                    "due_by": "overdue",
                    "count": issues.filter(target_date__lt=today).exclude(state__group__in=["completed", "cancelled"]).count(),
                },
                {"due_by": "no_due_date", "count": issues.filter(target_date__isnull=True).count()},
            ]
        else:  # default / "project"
            data = list(issues.values("project_id", "project__name").annotate(count=Count("id")))

        return Response({"group_by": group_by, "results": data}, status=status.HTTP_200_OK)


class WorkspaceTeamspaceRecurringIssueTemplatesEndpoint(BaseAPIView):
    """GET .../teamspaces/<id>/recurring-issue-templates/ - read-only
    aggregation of `RecurringIssueTemplate` rows across every project
    attached to the Teamspace (same `_accessible_project_ids` scoping as
    the other aggregation endpoints above - see spec section 2, exigence
    6). A recurring template still belongs to exactly one `Project`, never
    to a Teamspace directly (docs/feature-specs/06-automation-workflow-sla.md
    section 3, exigence 2: "le template reste rattaché à un seul projet"),
    and a Teamspace has no notion of a "default project" (`TeamspaceProject`
    is a plain many-to-many, see its docstring) - so create/update/delete/
    pause/resume/generate-now all deliberately stay on the existing
    project-scoped endpoints in `plane/app/views/recurring_issue_template/
    base.py`. This endpoint only gives a Teamspace a single place to see the
    templates across all of its projects at once; the frontend's "new
    template" flow first has the user pick one of the Teamspace's own
    projects, then opens the normal project-scoped create form against it."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id):
        try:
            Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        project_ids = _accessible_project_ids(request.user, slug, teamspace_id)
        if not project_ids:
            return Response({"results": []}, status=status.HTTP_200_OK)

        templates = (
            RecurringIssueTemplate.objects.filter(workspace__slug=slug, project_id__in=project_ids)
            .prefetch_related("labels", "assignees")
            .order_by("-created_at")
        )
        return self.paginate(
            request=request,
            queryset=templates,
            on_results=lambda results: RecurringIssueTemplateSerializer(results, many=True).data,
        )


# ---------------------------------------------------------------------------
# Feature 3 - Teamspace Pages and Views, spec section 3 "Considerations
# API/UX". Pages reuse the existing `Page` model/collaborative engine as-is
# (exigence 4), scoped via `teamspace` instead of `project`; Views use the
# dedicated `TeamspaceView` model (question ouverte 1 answered in favor of a
# dedicated model - see its docstring in `plane.db.models.view`).
# Read access follows Teamspace membership (Member=read, Lead/author=write),
# per exigence 6, independent of any underlying project's permissions.
# ---------------------------------------------------------------------------


class WorkspaceTeamspacePagesEndpoint(BaseAPIView):
    """GET/POST .../teamspaces/<id>/pages/ and GET/PATCH/DELETE
    .../pages/<page_id>/ - spec section 3, exigence 3/5."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id, page_id=None):
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        if page_id is not None:
            try:
                page = Page.objects.get(pk=page_id, teamspace=teamspace, deleted_at__isnull=True)
            except Page.DoesNotExist:
                return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
            return Response(TeamspacePageSerializer(page).data, status=status.HTTP_200_OK)

        pages = Page.objects.filter(teamspace=teamspace, deleted_at__isnull=True).order_by("-created_at")
        return Response(TeamspacePageSerializer(pages, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug, teamspace_id):
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        if not TeamspaceMember.objects.filter(
            teamspace=teamspace, member=request.user, deleted_at__isnull=True
        ).exists() and not _is_workspace_admin(request.user, slug):
            return Response(
                {"error": "Only teamspace members can create teamspace pages."}, status=status.HTTP_403_FORBIDDEN
            )

        serializer = TeamspacePageSerializer(data=request.data)
        if serializer.is_valid():
            page = Page.objects.create(
                **serializer.validated_data,
                teamspace=teamspace,
                workspace=teamspace.workspace,
                owned_by=request.user,
                created_by=request.user,
                updated_by=request.user,
            )
            return Response(TeamspacePageSerializer(page).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, slug, teamspace_id, page_id):
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
            page = Page.objects.get(pk=page_id, teamspace=teamspace, deleted_at__isnull=True)
        except (Teamspace.DoesNotExist, Page.DoesNotExist):
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 6 - Lead or the page's own author may edit; plain
        # Members are read-only.
        is_author = page.owned_by_id == request.user.id
        if not is_author and not _can_manage_teamspace(request.user, slug, teamspace.id):
            return Response(
                {"error": "Only the page author, teamspace leads, or workspace admins can edit this page."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if page.is_locked:
            return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = TeamspacePageSerializer(page, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, teamspace_id, page_id):
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
            page = Page.objects.get(pk=page_id, teamspace=teamspace, deleted_at__isnull=True)
        except (Teamspace.DoesNotExist, Page.DoesNotExist):
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        is_author = page.owned_by_id == request.user.id
        if not is_author and not _can_manage_teamspace(request.user, slug, teamspace.id):
            return Response(
                {"error": "Only the page author, teamspace leads, or workspace admins can delete this page."},
                status=status.HTTP_403_FORBIDDEN,
            )

        page.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceTeamspaceViewsEndpoint(BaseAPIView):
    """GET/POST .../teamspaces/<id>/views/ and GET/PATCH/DELETE
    .../views/<view_id>/ - spec section 3, exigence 1/2."""

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, teamspace_id, view_id=None):
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        if view_id is not None:
            try:
                view = TeamspaceView.objects.get(pk=view_id, teamspace=teamspace, deleted_at__isnull=True)
            except TeamspaceView.DoesNotExist:
                return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)
            return Response(TeamspaceViewSerializer(view).data, status=status.HTTP_200_OK)

        views = TeamspaceView.objects.filter(teamspace=teamspace, deleted_at__isnull=True).order_by("sort_order")
        return Response(TeamspaceViewSerializer(views, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug, teamspace_id):
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
        except Teamspace.DoesNotExist:
            return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 2 - creation/edition reserved to Teamspace Leads (and
        # workspace Admins).
        if not _can_manage_teamspace(request.user, slug, teamspace.id):
            return Response(
                {"error": "Only teamspace leads or workspace admins can create teamspace views."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TeamspaceViewSerializer(data=request.data)
        if serializer.is_valid():
            view = serializer.save(teamspace=teamspace, owned_by=request.user, created_by=request.user)
            return Response(TeamspaceViewSerializer(view).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, slug, teamspace_id, view_id):
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
            view = TeamspaceView.objects.get(pk=view_id, teamspace=teamspace, deleted_at__isnull=True)
        except (Teamspace.DoesNotExist, TeamspaceView.DoesNotExist):
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)

        is_author = view.owned_by_id == request.user.id
        if not is_author and not _can_manage_teamspace(request.user, slug, teamspace.id):
            return Response(
                {"error": "Only the view's author, teamspace leads, or workspace admins can edit this view."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TeamspaceViewSerializer(view, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, teamspace_id, view_id):
        try:
            teamspace = Teamspace.objects.get(pk=teamspace_id, workspace__slug=slug, deleted_at__isnull=True)
            view = TeamspaceView.objects.get(pk=view_id, teamspace=teamspace, deleted_at__isnull=True)
        except (Teamspace.DoesNotExist, TeamspaceView.DoesNotExist):
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)

        is_author = view.owned_by_id == request.user.id
        if not is_author and not _can_manage_teamspace(request.user, slug, teamspace.id):
            return Response(
                {"error": "Only the view's author, teamspace leads, or workspace admins can delete this view."},
                status=status.HTTP_403_FORBIDDEN,
            )

        view.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
