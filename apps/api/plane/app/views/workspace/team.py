# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Team, TeamMember, TeamProject, Workspace, Project
from plane.app.permissions import WorkspaceEntityPermission, WorkSpaceAdminPermission
from plane.app.serializers import (
    TeamSerializer,
    TeamDetailSerializer,
    TeamMemberSerializer,
    TeamProjectSerializer,
)


class WorkspaceTeamsEndpoint(BaseViewSet):
    """Workspace Teams endpoint for internal app API"""
    permission_classes = [WorkspaceEntityPermission]
    serializer_class = TeamSerializer
    model = Team

    def get_queryset(self):
        return Team.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            deleted_at__isnull=True
        ).select_related("workspace")

    def list(self, request, slug):
        """List all teams in workspace"""
        teams = self.get_queryset()
        serializer = TeamSerializer(teams, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug):
        """Create a new team"""
        workspace = Workspace.objects.get(slug=slug)
        serializer = TeamSerializer(data=request.data)
        if serializer.is_valid():
            team = serializer.save(workspace=workspace, created_by=request.user)
            # Add creator as admin member
            TeamMember.objects.create(
                team=team,
                member=request.user,
                role=20,  # Admin
                created_by=request.user
            )
            return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, pk):
        """Get team details with members and projects"""
        try:
            team = Team.objects.get(
                pk=pk,
                workspace__slug=slug,
                deleted_at__isnull=True
            )
            serializer = TeamDetailSerializer(team)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Team.DoesNotExist:
            return Response({"error": "Team not found"}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, slug, pk):
        """Update team"""
        try:
            team = Team.objects.get(
                pk=pk,
                workspace__slug=slug,
                deleted_at__isnull=True
            )
            serializer = TeamSerializer(team, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Team.DoesNotExist:
            return Response({"error": "Team not found"}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, slug, pk):
        """Delete team (soft delete)"""
        try:
            team = Team.objects.get(
                pk=pk,
                workspace__slug=slug,
                deleted_at__isnull=True
            )
            team.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Team.DoesNotExist:
            return Response({"error": "Team not found"}, status=status.HTTP_404_NOT_FOUND)


class WorkspaceTeamMembersEndpoint(BaseAPIView):
    """Team members endpoint"""
    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, team_id):
        """List team members"""
        members = TeamMember.objects.filter(
            team_id=team_id,
            team__workspace__slug=slug,
            deleted_at__isnull=True
        ).select_related("member")
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
            serializer = TeamMemberSerializer(data=request.data)
            if serializer.is_valid():
                member = serializer.save(team=team, created_by=request.user)
                return Response(TeamMemberSerializer(member).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Team.DoesNotExist:
            return Response({"error": "Team not found"}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, slug, team_id, member_id):
        """Remove member from team"""
        try:
            member = TeamMember.objects.get(
                pk=member_id,
                team_id=team_id,
                team__workspace__slug=slug,
                deleted_at__isnull=True
            )
            member.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except TeamMember.DoesNotExist:
            return Response({"error": "Team member not found"}, status=status.HTTP_404_NOT_FOUND)


class WorkspaceTeamProjectsEndpoint(BaseAPIView):
    """Team projects endpoint"""
    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, team_id):
        """List team projects"""
        projects = TeamProject.objects.filter(
            team_id=team_id,
            team__workspace__slug=slug,
            deleted_at__isnull=True
        ).select_related("project")
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
            serializer = TeamProjectSerializer(data=request.data)
            if serializer.is_valid():
                project_link = serializer.save(team=team, created_by=request.user)
                return Response(TeamProjectSerializer(project_link).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Team.DoesNotExist:
            return Response({"error": "Team not found"}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, slug, team_id, project_id):
        """Remove project from team"""
        try:
            project_link = TeamProject.objects.get(
                pk=project_id,
                team_id=team_id,
                team__workspace__slug=slug,
                deleted_at__isnull=True
            )
            project_link.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except TeamProject.DoesNotExist:
            return Response({"error": "Team project not found"}, status=status.HTTP_404_NOT_FOUND)
