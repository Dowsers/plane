# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Category 13 (docs/feature-specs/13-teamspaces.md in plane-selfhost),
# feature 1 - same style as `plane.app.serializers.team` (the pre-existing,
# deliberately separate/parallel Team feature) - plain ModelSerializer,
# SerializerMethodField counts, a *DetailSerializer that nests
# members/projects.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import (
    Page,
    Teamspace,
    TeamspaceMember,
    TeamspaceProject,
    TeamspaceView,
    TEAMSPACE_LEAD,
)


class TeamspaceSerializer(serializers.ModelSerializer):
    members_count = serializers.SerializerMethodField()
    projects_count = serializers.SerializerMethodField()

    class Meta:
        model = Teamspace
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
        read_only_fields = ["id", "workspace", "created_at", "updated_at"]

    def get_members_count(self, obj):
        return TeamspaceMember.objects.filter(teamspace=obj, deleted_at__isnull=True).count()

    def get_projects_count(self, obj):
        return TeamspaceProject.objects.filter(teamspace=obj, deleted_at__isnull=True).count()


class TeamspaceMemberSerializer(serializers.ModelSerializer):
    member_email = serializers.CharField(source="member.email", read_only=True)
    member_display_name = serializers.CharField(source="member.display_name", read_only=True)
    member_avatar = serializers.CharField(source="member.avatar", read_only=True)

    class Meta:
        model = TeamspaceMember
        fields = [
            "id",
            "teamspace",
            "member",
            "member_email",
            "member_display_name",
            "member_avatar",
            "role",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "teamspace", "created_at", "updated_at"]

    def validate(self, attrs):
        """A Teamspace must always keep at least one Lead (spec section 1,
        exigence 4: "transfert obligatoire avant le depart du dernier
        Lead"). This blocks demoting the last remaining Lead to Member;
        the symmetric "can't delete the last Lead" check lives in the
        view (`WorkspaceTeamspaceMembersEndpoint.delete`), since a plain
        serializer never runs on a DELETE.
        """
        instance = getattr(self, "instance", None)
        new_role = attrs.get("role", getattr(instance, "role", None))
        if instance is not None and instance.role == TEAMSPACE_LEAD and new_role != TEAMSPACE_LEAD:
            other_leads = (
                TeamspaceMember.objects.filter(
                    teamspace=instance.teamspace,
                    role=TEAMSPACE_LEAD,
                    deleted_at__isnull=True,
                )
                .exclude(pk=instance.pk)
                .exists()
            )
            if not other_leads:
                raise serializers.ValidationError(
                    "A teamspace must always have at least one Lead. Promote another member before changing this one's role."
                )
        return attrs


class TeamspaceProjectSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    project_identifier = serializers.CharField(source="project.identifier", read_only=True)

    class Meta:
        model = TeamspaceProject
        fields = [
            "id",
            "teamspace",
            "project",
            "project_name",
            "project_identifier",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "teamspace", "created_at", "updated_at"]


class TeamspaceDetailSerializer(TeamspaceSerializer):
    members = TeamspaceMemberSerializer(source="teamspace_members", many=True, read_only=True)
    projects = TeamspaceProjectSerializer(source="teamspace_projects", many=True, read_only=True)

    class Meta(TeamspaceSerializer.Meta):
        fields = TeamspaceSerializer.Meta.fields + ["members", "projects"]


class TeamspacePageSerializer(serializers.ModelSerializer):
    """Category 13, feature 3, exigence 3/5 - reuses the existing `Page`
    model as-is (same collaborative editing/versioning/locking engine,
    per exigence 4), scoped via `teamspace` instead of `project`. The
    mutual-exclusivity check with `project`/`projects` lives here rather
    than as a DB constraint, matching the spec's own note ("validee en
    serializer, pas necessairement en contrainte SQL").
    """

    class Meta:
        model = Page
        fields = [
            "id",
            "name",
            "owned_by",
            "access",
            "teamspace",
            "workspace",
            "logo_props",
            "is_locked",
            "archived_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "workspace", "owned_by", "created_at", "updated_at"]

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        teamspace = attrs.get("teamspace", getattr(instance, "teamspace", None))
        has_projects = (
            instance.projects.exists() if instance is not None and instance.pk else False
        )
        if teamspace is not None and has_projects:
            raise serializers.ValidationError(
                "A page cannot be attached to both a teamspace and a project at the same time."
            )
        return attrs


class TeamspaceViewSerializer(serializers.ModelSerializer):
    """Category 13, feature 3, exigence 1 - dedicated Teamspace-scoped
    view (see `TeamspaceView` model, `plane.db.models.view`), same
    `query`/`filters` shape as `IssueView`."""

    class Meta:
        model = TeamspaceView
        fields = [
            "id",
            "name",
            "description",
            "teamspace",
            "query",
            "filters",
            "display_filters",
            "display_properties",
            "access",
            "sort_order",
            "logo_props",
            "owned_by",
            "is_locked",
            "archived_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "teamspace", "query", "owned_by", "sort_order", "created_at", "updated_at"]
