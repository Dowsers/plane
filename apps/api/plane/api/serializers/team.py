# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import Team, TeamMember, TeamProject, User
from .base import BaseSerializer


class TeamMemberSerializer(BaseSerializer):
    """Serializer for team members"""
    member_email = serializers.EmailField(source='member.email', read_only=True)
    member_display_name = serializers.CharField(source='member.display_name', read_only=True)
    member_avatar = serializers.CharField(source='member.avatar', read_only=True)

    class Meta:
        model = TeamMember
        fields = [
            "id",
            "team",
            "member",
            "member_email",
            "member_display_name",
            "member_avatar",
            "role",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TeamProjectSerializer(BaseSerializer):
    """Serializer for team projects"""
    project_name = serializers.CharField(source='project.name', read_only=True)
    project_identifier = serializers.CharField(source='project.identifier', read_only=True)

    class Meta:
        model = TeamProject
        fields = [
            "id",
            "team",
            "project",
            "project_name",
            "project_identifier",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TeamSerializer(BaseSerializer):
    """Full team serializer with members and projects"""
    members_count = serializers.SerializerMethodField()
    projects_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "description",
            "workspace",
            "logo_props",
            "members_count",
            "projects_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_members_count(self, obj):
        return obj.team_members.filter(deleted_at__isnull=True).count()

    def get_projects_count(self, obj):
        return obj.team_projects.filter(deleted_at__isnull=True).count()


class TeamDetailSerializer(TeamSerializer):
    """Detailed team serializer including members and projects"""
    members = TeamMemberSerializer(source='team_members', many=True, read_only=True)
    projects = TeamProjectSerializer(source='team_projects', many=True, read_only=True)

    class Meta(TeamSerializer.Meta):
        fields = TeamSerializer.Meta.fields + ["members", "projects"]


class TeamLiteSerializer(BaseSerializer):
    """Lightweight team serializer"""

    class Meta:
        model = Team
        fields = ["id", "name", "logo_props"]
        read_only_fields = fields
