# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Third party frameworks
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from .issue import IssueIntakeSerializer, LabelLiteSerializer, IssueDetailSerializer
from .project import ProjectLiteSerializer
from .state import StateLiteSerializer
from .user import UserLiteSerializer
from plane.db.models import (
    Intake,
    IntakeForm,
    IntakeIssue,
    IntakeResponsibilitySetting,
    IntakeRotationMember,
    Issue,
    StateGroup,
    State,
)


class IntakeSerializer(BaseSerializer):
    project_detail = ProjectLiteSerializer(source="project", read_only=True)
    pending_issue_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Intake
        fields = "__all__"
        read_only_fields = ["project", "workspace"]


class IntakeIssueSerializer(BaseSerializer):
    issue = IssueIntakeSerializer(read_only=True)

    class Meta:
        model = IntakeIssue
        fields = [
            "id",
            "status",
            "duplicate_to",
            "snoozed_till",
            "source",
            "issue",
            "created_by",
            "assigned_to",
            "assigned_at",
            "escalation_count",
            "assignment_source",
        ]
        read_only_fields = ["project", "workspace", "assigned_at", "escalation_count", "assignment_source"]

    def validate(self, attrs):
        """
        Validate that if status is being changed to accepted (1),
        the project has a default state to transition to.
        """

        # Check if status is being updated to accepted
        if attrs.get("status") == 1:
            intake_issue = self.instance
            issue = intake_issue.issue

            # Check if issue is in TRIAGE state
            if issue.state and issue.state.group == StateGroup.TRIAGE.value:
                # Verify default state exists before allowing the update
                default_state = State.objects.filter(
                    workspace=intake_issue.workspace, project=intake_issue.project, default=True
                ).first()

                if not default_state:
                    raise serializers.ValidationError(
                        {"status": "Cannot accept intake issue: No default state found for the project"}
                    )

        return attrs

    def update(self, instance, validated_data):
        # A manual reassignment via this endpoint always takes assignment_source
        # back to "manual", regardless of how it was previously assigned -
        # exigence 6 de docs/feature-specs/02-cycles-intake.md.
        if "assigned_to" in validated_data:
            validated_data["assignment_source"] = "manual"
            validated_data["assigned_at"] = timezone.now()

        # Update the intake issue
        instance = super().update(instance, validated_data)

        # If status is accepted (1), transition the issue state from TRIAGE to default
        if validated_data.get("status") == 1:
            issue = instance.issue
            if issue.state and issue.state.group == StateGroup.TRIAGE.value:
                # Get the default project state
                default_state = State.objects.filter(
                    workspace=instance.workspace, project=instance.project, default=True
                ).first()
                if default_state:
                    issue.state = default_state
                    issue.save()

        return instance

    def to_representation(self, instance):
        # Pass the annotated fields to the Issue instance if they exist
        if hasattr(instance, "label_ids"):
            instance.issue.label_ids = instance.label_ids
        return super().to_representation(instance)


class IntakeIssueDetailSerializer(BaseSerializer):
    issue = IssueDetailSerializer(read_only=True)
    duplicate_issue_detail = IssueIntakeSerializer(read_only=True, source="duplicate_to")

    class Meta:
        model = IntakeIssue
        fields = [
            "id",
            "status",
            "duplicate_to",
            "snoozed_till",
            "duplicate_issue_detail",
            "source",
            "issue",
            "assigned_to",
            "assigned_at",
            "escalation_count",
            "assignment_source",
            "submitter_name",
            "submitter_email",
        ]
        read_only_fields = [
            "project",
            "workspace",
            "assigned_to",
            "assigned_at",
            "escalation_count",
            "assignment_source",
            "submitter_name",
            "submitter_email",
        ]

    def to_representation(self, instance):
        # Pass the annotated fields to the Issue instance if they exist
        if hasattr(instance, "assignee_ids"):
            instance.issue.assignee_ids = instance.assignee_ids
        if hasattr(instance, "label_ids"):
            instance.issue.label_ids = instance.label_ids

        return super().to_representation(instance)


class IntakeIssueLiteSerializer(BaseSerializer):
    class Meta:
        model = IntakeIssue
        fields = ["id", "status", "duplicate_to", "snoozed_till", "source"]
        read_only_fields = fields


class IssueStateIntakeSerializer(BaseSerializer):
    state_detail = StateLiteSerializer(read_only=True, source="state")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    label_details = LabelLiteSerializer(read_only=True, source="labels", many=True)
    assignee_details = UserLiteSerializer(read_only=True, source="assignees", many=True)
    sub_issues_count = serializers.IntegerField(read_only=True)
    issue_intake = IntakeIssueLiteSerializer(read_only=True, many=True)

    class Meta:
        model = Issue
        fields = "__all__"


class IntakeResponsibilitySettingSerializer(BaseSerializer):
    class Meta:
        model = IntakeResponsibilitySetting
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "is_enabled",
            "assignment_mode",
            "fixed_owner",
            "escalation_timeout_minutes",
        ]
        read_only_fields = ["id", "workspace_id", "project_id"]


class IntakeRotationMemberSerializer(BaseSerializer):
    member_detail = UserLiteSerializer(read_only=True, source="member")

    class Meta:
        model = IntakeRotationMember
        fields = ["id", "member", "member_detail", "sort_order", "is_active"]
        read_only_fields = ["id"]


class IntakeFormSerializer(BaseSerializer):
    class Meta:
        model = IntakeForm
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "name",
            "description_html",
            "token",
            "is_enabled",
            "default_state",
            "default_priority",
            "default_labels",
            "show_priority_field",
            "show_labels_field",
            "allow_attachments",
            "max_attachments",
            "require_submitter_name",
            "require_submitter_email",
            "send_confirmation_email",
            "success_message",
            "redirect_url",
            "rate_limit_per_ip_per_hour",
        ]
        read_only_fields = ["id", "workspace_id", "project_id", "token"]
