# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import secrets

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel
from plane.db.models.workspace import WorkspaceBaseModel


def get_email_alias_local_part():
    return f"intake-{secrets.token_hex(8)}"


class IntakeChannel(ProjectBaseModel):
    """
    Omnichannel intake (email/Slack) configuration - see
    docs/feature-specs/02-cycles-intake.md ("Intake omnicanal (email +
    Slack-to-issue)") in plane-selfhost. This is a SKELETON iteration - see
    docker/api/omnichannel-intake-skeleton/README.md for exactly what is
    and isn't wired up to a real provider.
    """

    CHANNEL_TYPE_CHOICES = (("EMAIL", "Email"), ("SLACK", "Slack"))

    channel_type = models.CharField(max_length=10, choices=CHANNEL_TYPE_CHOICES)
    is_enabled = models.BooleanField(default=True)
    # Provider-specific config that doesn't warrant its own column (e.g.
    # slack_channel_id for a SLACK channel row).
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Intake Channel"
        verbose_name_plural = "Intake Channels"
        db_table = "intake_channels"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(channel_type="EMAIL", is_enabled=True, deleted_at__isnull=True),
                name="one_active_email_channel_per_project",
            )
        ]

    def __str__(self):
        return f"{self.channel_type} <{self.project_id}>"


class InboundEmailAlias(ProjectBaseModel):
    intake_channel = models.OneToOneField(IntakeChannel, on_delete=models.CASCADE, related_name="email_alias")
    local_part = models.CharField(max_length=255, unique=True, db_index=True, default=get_email_alias_local_part)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Inbound Email Alias"
        verbose_name_plural = "Inbound Email Aliases"
        db_table = "inbound_email_aliases"
        ordering = ("-created_at",)

    @property
    def full_address(self):
        domain = getattr(settings, "INTAKE_EMAIL_DOMAIN", None) or "intake.example.com"
        return f"{self.local_part}@{domain}"

    def __str__(self):
        return self.full_address


class SlackWorkspaceConnection(WorkspaceBaseModel):
    """
    One Slack app installation per Plane workspace. bot_access_token is
    stored in plain text, matching the existing precedent in this codebase
    (SlackProjectSync.access_token, plane/db/models/integration/slack.py) -
    there is no at-rest encryption mechanism for integration credentials
    anywhere in this fork today, despite what the feature spec assumed.
    """

    slack_team_id = models.CharField(max_length=64)
    slack_team_name = models.CharField(max_length=255, blank=True)
    bot_access_token = models.CharField(max_length=300, blank=True)
    signing_secret = models.CharField(max_length=300, blank=True)
    connected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="slack_connections_made"
    )
    connected_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Slack Workspace Connection"
        verbose_name_plural = "Slack Workspace Connections"
        db_table = "slack_workspace_connections"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace"],
                condition=models.Q(is_active=True, deleted_at__isnull=True),
                name="one_active_slack_connection_per_workspace",
            )
        ]

    def __str__(self):
        return f"{self.slack_team_name or self.slack_team_id} <{self.workspace_id}>"


class SlackChannelProjectMapping(ProjectBaseModel):
    slack_connection = models.ForeignKey(
        SlackWorkspaceConnection, on_delete=models.CASCADE, related_name="channel_mappings"
    )
    slack_channel_id = models.CharField(max_length=64)
    is_default_for_dm = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Slack Channel Project Mapping"
        verbose_name_plural = "Slack Channel Project Mappings"
        db_table = "slack_channel_project_mappings"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["slack_connection", "slack_channel_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_slack_channel_per_connection",
            )
        ]

    def __str__(self):
        return f"{self.slack_channel_id} -> {self.project_id}"


class IntakeMessageLog(ProjectBaseModel):
    """
    Audit trail for inbound/outbound omnichannel messages - used for replay
    on failure and for inbound-webhook deduplication. raw_payload has no
    automatic retention/purge in this iteration - see README for the data
    retention question this leaves open (may contain PII from email bodies).
    """

    DIRECTION_CHOICES = (("INBOUND", "Inbound"), ("OUTBOUND", "Outbound"))

    intake_issue = models.ForeignKey(
        "db.IntakeIssue", on_delete=models.CASCADE, null=True, blank=True, related_name="message_logs"
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    channel_type = models.CharField(max_length=10, choices=IntakeChannel.CHANNEL_TYPE_CHOICES)
    external_message_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    raw_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Intake Message Log"
        verbose_name_plural = "Intake Message Logs"
        db_table = "intake_message_logs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.direction}:{self.channel_type} <{self.intake_issue_id}>"
