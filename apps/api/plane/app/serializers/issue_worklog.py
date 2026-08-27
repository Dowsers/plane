# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import date

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from .user import UserLiteSerializer
from .project import ProjectLiteSerializer
from plane.db.models import IssueWorklog, TimesheetPeriod


class IssueWorklogSerializer(BaseSerializer):
    logged_by_detail = UserLiteSerializer(read_only=True, source="logged_by")

    class Meta:
        model = IssueWorklog
        fields = [
            "id",
            "issue",
            "project",
            "workspace",
            "logged_by",
            "logged_by_detail",
            "duration",
            "logged_at",
            "description",
            "timesheet_period",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "issue",
            "project",
            "workspace",
            "logged_by",
            "timesheet_period",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_duration(self, value):
        if value < 1:
            raise serializers.ValidationError("Duration must be at least 1 minute")
        return value

    def validate_logged_at(self, value):
        if value > date.today():
            raise serializers.ValidationError("Cannot log time for a future date")
        return value


class IssueWorklogExportSerializer(BaseSerializer):
    """
    Flat, one-row-per-entry shape for the "issue_worklogs" ExporterHistory
    CSV export - see docs/feature-specs/14-pricing-gap-remediation.md
    ("14a. Time Tracking and Work Logs", feature 2, exigence 6) in
    plane-selfhost: project name, work item, author, date, duration,
    description.
    """

    project_name = serializers.CharField(source="project.name", read_only=True)
    issue_name = serializers.CharField(source="issue.name", read_only=True)
    issue_sequence_id = serializers.SerializerMethodField()
    logged_by_email = serializers.CharField(source="logged_by.email", read_only=True)
    logged_by_display_name = serializers.CharField(source="logged_by.display_name", read_only=True)

    class Meta:
        model = IssueWorklog
        fields = [
            "id",
            "project_name",
            "issue_sequence_id",
            "issue_name",
            "logged_by_email",
            "logged_by_display_name",
            "logged_at",
            "duration",
            "description",
        ]
        read_only_fields = fields

    def get_issue_sequence_id(self, obj):
        return f"{obj.project.identifier}-{obj.issue.sequence_id}"


class TimesheetPeriodSerializer(BaseSerializer):
    logged_by_detail = UserLiteSerializer(read_only=True, source="logged_by")
    approved_by_detail = UserLiteSerializer(read_only=True, source="approved_by")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")

    class Meta:
        model = TimesheetPeriod
        fields = [
            "id",
            "project",
            "project_detail",
            "workspace",
            "logged_by",
            "logged_by_detail",
            "period_start",
            "period_end",
            "status",
            "submitted_at",
            "approved_by",
            "approved_by_detail",
            "approved_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
