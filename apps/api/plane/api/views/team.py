# Python imports
import logging

# Django imports
from django.db.models import Count, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.api.views.base import BaseAPIView
from plane.db.models import Team, TeamMember, TeamProject, WorkspaceMember, Project
from plane.api.serializers import (
    TeamSerializer,
    TeamDetailSerializer,
    TeamLiteSerializer,
    TeamMemberSerializer,
    TeamProjectSerializer,
)
from plane.utils.permissions.workspace import WorkspaceEntityPermission

logger = logging.getLogger("plane.api")


class TeamViewSet(BaseAPIView):
    """
    Team management endpoints for workspaces.
    Provides CRUD operations for teams within a workspace.
    """

    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return Team.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            deleted_at__isnull=True,
        ).annotate(
            members_count=Count(
                "team_members",
                filter=Q(team_members__deleted_at__isnull=True)
            ),
            projects_count=Count(
                "team_projects",
                filter=Q(team_projects__deleted_at__isnull=True)
            ),
        ).order_by("-created_at")

    def get(self, request, slug, pk=None):
        """Get all teams or a specific team"""
        if pk:
            # Get specific team with details
            try:
                team = self.get_queryset().get(pk=pk)
                serializer = TeamDetailSerializer(team)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except Team.DoesNotExist:
                return Response(
                    {"error": "Team not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # List all teams
            teams = self.get_queryset()
            serializer = TeamSerializer(teams, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, slug):
        """Create a new team"""
        # Get workspace from slug
        try:
            workspace_member = WorkspaceMember.objects.get(
                workspace__slug=slug,
                member=request.user,
                is_active=True,
                deleted_at__isnull=True,
            )
        except WorkspaceMember.DoesNotExist:
            return Response(
                {"error": "You are not a member of this workspace"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Only admins can create teams
        if workspace_member.role < 20:
            return Response(
                {"error": "Only admins can create teams"},
                status=status.HTTP_403_FORBIDDEN
            )

        data = request.data.copy()
        data["workspace"] = workspace_member.workspace.id

        serializer = TeamSerializer(data=data)
        if serializer.is_valid():
            team = serializer.save()
            # Add creator as team admin
            TeamMember.objects.create(
                team=team,
                member=request.user,
                role=20,  # Admin
                created_by=request.user
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, slug, pk):
        """Update a team"""
        try:
            team = self.get_queryset().get(pk=pk)
        except Team.DoesNotExist:
            return Response(
                {"error": "Team not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = TeamSerializer(team, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, pk):
        """Delete a team (soft delete)"""
        try:
            team = self.get_queryset().get(pk=pk)
        except Team.DoesNotExist:
            return Response(
                {"error": "Team not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        team.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberViewSet(BaseAPIView):
    """
    Team member management endpoints.
    """

    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return TeamMember.objects.filter(
            team__workspace__slug=self.kwargs.get("slug"),
            team_id=self.kwargs.get("team_id"),
            deleted_at__isnull=True,
        ).select_related("member", "team")

    def get(self, request, slug, team_id, pk=None):
        """Get team members"""
        members = self.get_queryset()
        serializer = TeamMemberSerializer(members, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, slug, team_id):
        """Add member to team"""
        try:
            team = Team.objects.get(
                pk=team_id,
                workspace__slug=slug,
                deleted_at__isnull=True
            )
        except Team.DoesNotExist:
            return Response(
                {"error": "Team not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        member_id = request.data.get("member")
        role = request.data.get("role", 15)  # Default to member

        # Check if user is workspace member
        try:
            workspace_member = WorkspaceMember.objects.get(
                workspace=team.workspace,
                member_id=member_id,
                is_active=True,
                deleted_at__isnull=True,
            )
        except WorkspaceMember.DoesNotExist:
            return Response(
                {"error": "User is not a member of this workspace"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if already a team member
        if TeamMember.objects.filter(
            team=team,
            member_id=member_id,
            deleted_at__isnull=True
        ).exists():
            return Response(
                {"error": "User is already a member of this team"},
                status=status.HTTP_400_BAD_REQUEST
            )

        team_member = TeamMember.objects.create(
            team=team,
            member_id=member_id,
            role=role,
            created_by=request.user
        )

        serializer = TeamMemberSerializer(team_member)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request, slug, team_id, pk):
        """Remove member from team"""
        try:
            team_member = self.get_queryset().get(pk=pk)
        except TeamMember.DoesNotExist:
            return Response(
                {"error": "Team member not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        team_member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamProjectViewSet(BaseAPIView):
    """
    Team project management endpoints.
    """

    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return TeamProject.objects.filter(
            team__workspace__slug=self.kwargs.get("slug"),
            team_id=self.kwargs.get("team_id"),
            deleted_at__isnull=True,
        ).select_related("project", "team")

    def get(self, request, slug, team_id, pk=None):
        """Get team projects"""
        projects = self.get_queryset()
        serializer = TeamProjectSerializer(projects, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, slug, team_id):
        """Add project to team"""
        try:
            team = Team.objects.get(
                pk=team_id,
                workspace__slug=slug,
                deleted_at__isnull=True
            )
        except Team.DoesNotExist:
            return Response(
                {"error": "Team not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        project_id = request.data.get("project")

        # Check if project belongs to workspace
        try:
            project = Project.objects.get(
                pk=project_id,
                workspace=team.workspace,
                deleted_at__isnull=True
            )
        except Project.DoesNotExist:
            return Response(
                {"error": "Project not found in this workspace"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if already linked
        if TeamProject.objects.filter(
            team=team,
            project=project,
            deleted_at__isnull=True
        ).exists():
            return Response(
                {"error": "Project is already linked to this team"},
                status=status.HTTP_400_BAD_REQUEST
            )

        team_project = TeamProject.objects.create(
            team=team,
            project=project,
            created_by=request.user
        )

        serializer = TeamProjectSerializer(team_project)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request, slug, team_id, pk):
        """Remove project from team"""
        try:
            team_project = self.get_queryset().get(pk=pk)
        except TeamProject.DoesNotExist:
            return Response(
                {"error": "Team project link not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        team_project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
