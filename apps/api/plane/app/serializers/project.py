# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Python imports
import re

# Django imports
from django.db import transaction

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from plane.app.permissions.workspace import Admin as WORKSPACE_ADMIN
from plane.app.serializers.workspace import WorkspaceLiteSerializer
from plane.app.serializers.user import UserLiteSerializer, UserAdminLiteSerializer
from plane.db.models import (
    Project,
    ProjectMember,
    ProjectMemberInvite,
    ProjectIdentifier,
    DeployBoard,
    ProjectPublicMember,
    Issue,
    IssueSequence,
    TeamspaceMember,
    TeamspaceProject,
    TEAMSPACE_LEAD,
    WorkspaceMember,
)
from plane.utils.content_validator import (
    validate_html_content,
)
from plane.utils.agent_actor import agent_role_error, is_member_visible, is_workspace_agent
from plane.utils.issue_sequencing import assign_next_sequence


class ProjectSerializer(BaseSerializer):
    workspace_detail = WorkspaceLiteSerializer(source="workspace", read_only=True)
    inbox_view = serializers.BooleanField(read_only=True, source="intake_view")

    class Meta:
        model = Project
        fields = "__all__"
        read_only_fields = ["workspace", "deleted_at"]

    def validate_name(self, name):
        project_id = self.instance.id if self.instance else None
        workspace_id = self.context["workspace_id"]

        if re.match(Project.FORBIDDEN_IDENTIFIER_CHARS_PATTERN, name):
            raise serializers.ValidationError(detail="PROJECT_NAME_CANNOT_CONTAIN_SPECIAL_CHARACTERS")

        project = Project.objects.filter(name=name, workspace_id=workspace_id)

        if project_id:
            project = project.exclude(id=project_id)

        if project.exists():
            raise serializers.ValidationError(
                detail="PROJECT_NAME_ALREADY_EXIST",
            )

        return name

    def validate_identifier(self, identifier):
        project_id = self.instance.id if self.instance else None
        workspace_id = self.context["workspace_id"]

        if re.match(Project.FORBIDDEN_IDENTIFIER_CHARS_PATTERN, identifier):
            raise serializers.ValidationError(detail="PROJECT_IDENTIFIER_CANNOT_CONTAIN_SPECIAL_CHARACTERS")

        project = Project.objects.filter(identifier=identifier, workspace_id=workspace_id)

        if project_id:
            project = project.exclude(id=project_id)

        if project.exists():
            raise serializers.ValidationError(
                detail="PROJECT_IDENTIFIER_ALREADY_EXIST",
            )

        return identifier

    def _is_teamspace_lead_or_workspace_admin(self, request, workspace_id, teamspace_id):
        if request is None:
            return True
        if WorkspaceMember.objects.filter(
            member=request.user, workspace_id=workspace_id, role=WORKSPACE_ADMIN, is_active=True
        ).exists():
            return True
        return TeamspaceMember.objects.filter(
            teamspace_id=teamspace_id, member=request.user, role=TEAMSPACE_LEAD, deleted_at__isnull=True
        ).exists()

    def validate_primary_teamspace(self, value):
        workspace_id = self.context["workspace_id"]
        request = self.context.get("request")

        if value is not None and str(value.workspace_id) != str(workspace_id):
            raise serializers.ValidationError(detail="TEAM_DOES_NOT_BELONG_TO_WORKSPACE")

        # Joining, changing, or leaving a project's `primary_teamspace` all
        # require the same bar - Lead of whichever team is actually being
        # touched (old, new, or both when swapping directly between two
        # teams), or a workspace Admin. Re-implemented rather than
        # importing `_can_manage_teamspace`
        # (apps/api/plane/app/views/workspace/teamspace.py), since that
        # module imports from plane.app.serializers and importing it back
        # here would be a circular import.
        current_teamspace_id = getattr(self.instance, "primary_teamspace_id", None) if self.instance else None
        new_teamspace_id = value.id if value is not None else None
        if current_teamspace_id == new_teamspace_id:
            return value

        if new_teamspace_id is not None and not self._is_teamspace_lead_or_workspace_admin(
            request, workspace_id, new_teamspace_id
        ):
            raise serializers.ValidationError(detail="MUST_BE_TEAM_LEAD_TO_SET_AS_PRIMARY_TEAM")
        if current_teamspace_id is not None and not self._is_teamspace_lead_or_workspace_admin(
            request, workspace_id, current_teamspace_id
        ):
            raise serializers.ValidationError(detail="MUST_BE_TEAM_LEAD_TO_CHANGE_PRIMARY_TEAM")

        return value

    def validate(self, data):
        # Validate description content for security
        if "description_html" in data and data["description_html"]:
            is_valid, error_msg, sanitized_html = validate_html_content(str(data["description_html"]))
            # Update the data with sanitized HTML if available
            if sanitized_html is not None:
                data["description_html"] = sanitized_html

            if not is_valid:
                raise serializers.ValidationError({"error": "html content is not valid"})

        # update_owner must be an active member of this project - see
        # docs/feature-specs/03-projects-roadmaps-initiatives.md ("Mises a
        # jour de statut structurees") in plane-selfhost. Applicative
        # constraint only, not a DB one.
        update_owner = data.get("update_owner")
        if update_owner is not None and self.instance is not None:
            if not ProjectMember.objects.filter(
                project=self.instance, member=update_owner, is_active=True
            ).exists():
                raise serializers.ValidationError(
                    {"update_owner": "The update owner must be an active member of this project"}
                )

        # Roadmap start/target date ordering - see
        # docs/feature-specs/03-projects-roadmaps-initiatives.md ("Roadmap/
        # Timeline cross-projet") in plane-selfhost.
        start_date = data.get("start_date", getattr(self.instance, "start_date", None))
        target_date = data.get("target_date", getattr(self.instance, "target_date", None))
        if start_date is not None and target_date is not None and target_date < start_date:
            raise serializers.ValidationError({"target_date": "Target date cannot be before start date"})

        # Exigence 11 (docs/feature-specs/09-ai-features.md "7. Type
        # d'acteur agent de premiere classe" in plane-selfhost) - an agent
        # can never be set as project lead. `project_lead` is a real,
        # writable field on this serializer (fields = "__all__"), unlike
        # `Workspace.owner`.
        project_lead = data.get("project_lead")
        if project_lead is not None and is_workspace_agent(project_lead):
            raise serializers.ValidationError(agent_role_error("project_lead"))

        return data

    def create(self, validated_data):
        workspace_id = self.context["workspace_id"]

        project = Project.objects.create(**validated_data, workspace_id=workspace_id)

        ProjectIdentifier.objects.create(name=project.identifier, project=project, workspace_id=workspace_id)

        # Keep the single-referent `primary_teamspace` FK and the
        # many-to-many `TeamspaceProject` pivot in sync: picking a team at
        # creation time should also make the project show up in that
        # team's own "Projects" tab, not just silently set the FK.
        if project.primary_teamspace_id:
            TeamspaceProject.objects.create(teamspace_id=project.primary_teamspace_id, project=project)

        return project

    def update(self, instance, validated_data):
        old_teamspace_id = instance.primary_teamspace_id
        team_changed = "primary_teamspace" in validated_data and (
            (validated_data["primary_teamspace"].id if validated_data["primary_teamspace"] else None)
            != old_teamspace_id
        )

        project = super().update(instance, validated_data)

        if team_changed:
            new_teamspace = project.primary_teamspace
            if new_teamspace is not None:
                # Same free pivot-sync as create() - the old team's
                # TeamspaceProject row (if any) is deliberately left alone,
                # matching that pivot's documented independence from
                # `primary_teamspace`.
                TeamspaceProject.objects.get_or_create(teamspace_id=new_teamspace.id, project=project)

            with transaction.atomic():
                issues = list(Issue.objects.filter(project=project).order_by("created_at"))
                assign_next_sequence(issues, new_teamspace, workspace=project.workspace)
                Issue.objects.bulk_update(issues, ["sequence_id", "sequence_teamspace"])
                IssueSequence.objects.bulk_create(
                    [
                        IssueSequence(
                            issue=issue,
                            sequence=issue.sequence_id,
                            project=project,
                            workspace=project.workspace,
                            teamspace=issue.sequence_teamspace,
                        )
                        for issue in issues
                    ]
                )

        return project


class ProjectLiteSerializer(BaseSerializer):
    class Meta:
        model = Project
        fields = [
            "id",
            "identifier",
            "name",
            "cover_image",
            "cover_image_url",
            "logo_props",
            "description",
        ]
        read_only_fields = fields


class ProjectListSerializer(DynamicBaseSerializer):
    is_favorite = serializers.BooleanField(read_only=True)
    sort_order = serializers.FloatField(read_only=True)
    member_role = serializers.IntegerField(read_only=True)
    anchor = serializers.CharField(read_only=True)
    members = serializers.SerializerMethodField()
    cover_image_url = serializers.CharField(read_only=True)
    inbox_view = serializers.BooleanField(read_only=True, source="intake_view")
    next_work_item_sequence = serializers.IntegerField(read_only=True)
    initiative_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True)
    latest_update_status = serializers.CharField(read_only=True, allow_null=True)

    def get_members(self, obj):
        project_members = getattr(obj, "members_list", None)
        if project_members is not None:
            # Filter members by the project ID
            return [
                member.member_id
                for member in project_members
                if member.is_active and is_member_visible(member.member)
            ]
        return []

    class Meta:
        model = Project
        fields = "__all__"


class ProjectDetailSerializer(BaseSerializer):
    # workspace = WorkSpaceSerializer(read_only=True)
    default_assignee = UserLiteSerializer(read_only=True)
    project_lead = UserLiteSerializer(read_only=True)
    is_favorite = serializers.BooleanField(read_only=True)
    sort_order = serializers.FloatField(read_only=True)
    member_role = serializers.IntegerField(read_only=True)
    anchor = serializers.CharField(read_only=True)

    class Meta:
        model = Project
        fields = "__all__"


class ProjectMemberSerializer(BaseSerializer):
    workspace = WorkspaceLiteSerializer(read_only=True)
    project = ProjectLiteSerializer(read_only=True)
    member = UserLiteSerializer(read_only=True)

    class Meta:
        model = ProjectMember
        fields = "__all__"
        # Category 11 (docs/feature-specs/11-admin-security-sso.md in
        # plane-selfhost), feature 5 - `is_owner` must only ever change via
        # the dedicated `ProjectOwnerEndpoint` (assign/revoke, with its own
        # eligibility checks and audit trail), never as a side effect of
        # this serializer's generic member PATCH
        # (`ProjectMemberViewSet.partial_update`).
        read_only_fields = ["is_owner"]


class ProjectMemberPreferenceSerializer(BaseSerializer):
    class Meta:
        model = ProjectMember
        fields = ["preferences", "project_id", "member_id", "workspace_id"]

    def validate_preferences(self, value):
        preferences = self.instance.preferences

        preferences.update(value)
        return preferences


class ProjectMemberAdminSerializer(BaseSerializer):
    workspace = WorkspaceLiteSerializer(read_only=True)
    project = ProjectLiteSerializer(read_only=True)
    member = UserAdminLiteSerializer(read_only=True)

    class Meta:
        model = ProjectMember
        fields = "__all__"


class ProjectMemberRoleSerializer(DynamicBaseSerializer):
    original_role = serializers.IntegerField(source="role", read_only=True)

    class Meta:
        model = ProjectMember
        fields = ("id", "role", "member", "project", "original_role", "created_at", "is_owner")
        read_only_fields = ["original_role", "created_at", "is_owner"]


class ProjectMemberInviteSerializer(BaseSerializer):
    project = ProjectLiteSerializer(read_only=True)
    workspace = WorkspaceLiteSerializer(read_only=True)

    class Meta:
        model = ProjectMemberInvite
        fields = "__all__"


class ProjectIdentifierSerializer(BaseSerializer):
    class Meta:
        model = ProjectIdentifier
        fields = "__all__"


class ProjectMemberLiteSerializer(BaseSerializer):
    member = UserLiteSerializer(read_only=True)
    is_subscribed = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProjectMember
        fields = ["member", "id", "is_subscribed"]
        read_only_fields = fields


class DeployBoardSerializer(BaseSerializer):
    project_details = ProjectLiteSerializer(read_only=True, source="project")
    workspace_detail = WorkspaceLiteSerializer(read_only=True, source="workspace")

    class Meta:
        model = DeployBoard
        fields = "__all__"
        read_only_fields = ["workspace", "project", "anchor"]


class ProjectPublicMemberSerializer(BaseSerializer):
    class Meta:
        model = ProjectPublicMember
        fields = "__all__"
        read_only_fields = ["workspace", "project", "member"]
