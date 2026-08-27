# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import secrets
import string
from datetime import timedelta

# Django imports
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone

# Module imports
from plane.db.fields import EncryptedTextField
from plane.db.models.project import ProjectBaseModel
from plane.db.models.workspace import WorkspaceBaseModel


def get_email_alias_local_part():
    return f"intake-{secrets.token_hex(8)}"


# 14d ("Intake Email and Slack", levee du squelette, exigence 6/9) - the
# Issue.external_source value used to mark an issue as created by the
# email intake channel; Issue.external_id is set to the sender's address
# on that same issue so the outbound reply-notification task
# (plane.bgtasks.intake_email_task) knows who to email back. Not a DB
# choice constraint - Issue.external_source is a free-form CharField
# shared across every integration (see plane/db/models/issue.py) - just a
# documented constant so the string literal isn't duplicated across the
# view and the task.
EMAIL_INTAKE_EXTERNAL_SOURCE = "EMAIL_INTAKE"


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
    One Slack app installation per Plane workspace - see
    docs/feature-specs/07-integrations-git.md ("3. App Slack open-source")
    in plane-selfhost, docker/api/slack-app/README.md for what's real vs
    documented-gap in this iteration.

    `installation_method` records how this connection was established:
    - MANUAL_BOT_TOKEN: an admin manually created a Slack app at
      api.slack.com/apps (single-workspace install, no OAuth redirect
      needed) and pasted its Bot User OAuth Token + Signing Secret here.
      This is the primary, genuinely-testable-today v1 path - see the
      README for why this is a better fit for self-hosted Slack than a
      multi-tenant OAuth flow would be.
    - OAUTH: the standard `oauth.v2.access` authorization-code exchange.
      Real code exists (SlackOAuthCallbackEndpoint) but requires a
      registered Slack app client_id/secret AND a publicly-reachable
      callback URL, neither available in this sandbox - untestable
      end-to-end here, disabled unless SLACK_CLIENT_ID/SLACK_CLIENT_SECRET
      are configured.

    bot_access_token/signing_secret were plaintext CharFields in the
    original Category 2 skeleton - migrated to EncryptedTextField here
    (Category 7 prerequisite, see plane.db.fields.EncryptedTextField).
    """

    INSTALLATION_METHOD_CHOICES = (
        ("MANUAL_BOT_TOKEN", "Manual bot token"),
        ("OAUTH", "OAuth"),
    )

    slack_team_id = models.CharField(max_length=64)
    slack_team_name = models.CharField(max_length=255, blank=True)
    bot_access_token = EncryptedTextField(blank=True)
    signing_secret = EncryptedTextField(blank=True)
    bot_user_id = models.CharField(max_length=64, blank=True)
    installation_method = models.CharField(
        max_length=20, choices=INSTALLATION_METHOD_CHOICES, default="MANUAL_BOT_TOKEN"
    )
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


# Exigence 11 (docs/feature-specs/07-integrations-git.md, "3. App Slack
# open-source") - the notification types a channel<->project mapping can
# subscribe to.
SLACK_NOTIFY_EVENT_CHOICES = (
    "issue_created",
    "issue_status_changed",
    "issue_assigned",
    "comment_added",
    "issue_closed",
)


class SlackChannelProjectMapping(ProjectBaseModel):
    """
    Exigence 11 requires N:N (a channel mappable to several projects) -
    the original Category 2 skeleton's unique constraint was
    (slack_connection, slack_channel_id), which only ever allowed ONE
    project per channel. Relaxed here to
    (slack_connection, slack_channel_id, project) so a channel can
    aggregate events from multiple projects, while still preventing a
    duplicate mapping of the same (channel, project) pair. Each mapping
    row's creation is independently permission-checked (creator must be
    ROLE.ADMIN of that exact project, see
    SlackChannelProjectMappingViewSet.create()) - this is what actually
    enforces exigence 12 (a channel never receives events for a project
    the configuring admin has no access to): there is structurally no way
    to create a mapping row for a project you are not an admin of, so a
    channel that aggregates several projects only ever does so because an
    admin of each of those specific projects explicitly opted in.
    """

    slack_connection = models.ForeignKey(
        SlackWorkspaceConnection, on_delete=models.CASCADE, related_name="channel_mappings"
    )
    slack_channel_id = models.CharField(max_length=64)
    slack_channel_name = models.CharField(max_length=255, blank=True)
    is_default_for_dm = models.BooleanField(default=False)
    notify_on = ArrayField(
        models.CharField(max_length=32), default=list, blank=True, size=len(SLACK_NOTIFY_EVENT_CHOICES)
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Slack Channel Project Mapping"
        verbose_name_plural = "Slack Channel Project Mappings"
        db_table = "slack_channel_project_mappings"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["slack_connection", "slack_channel_id", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_slack_channel_per_connection_and_project",
            )
        ]

    def __str__(self):
        return f"{self.slack_channel_id} -> {self.project_id}"


class SlackUserConnection(WorkspaceBaseModel):
    """
    Links a Slack user identity to a Plane user (exigence 3 and 5,
    "3. App Slack open-source"). Rows are created in a PENDING state (via
    the `/plane link` slash command, see space/views/intake_channel.py)
    with `user=None` and a short-lived `verification_code`; a
    session-authenticated Plane user then "claims" the code
    (SlackUserLinkVerifyEndpoint, app/views/intake/channel.py) to set
    `user` and complete the link. This is the documented, testable-without-
    a-live-Slack-app fallback for exigence 3's "flux OAuth ou code de
    verification a usage unique" - a full Slack-side OAuth identity flow
    (Sign in with Slack) would need its own registered app/redirect URL,
    same limitation as the workspace-level OAuth path.
    """

    SOURCE_CHOICES = (("PENDING", "Pending"), ("VERIFIED", "Verified"))

    slack_connection = models.ForeignKey(
        SlackWorkspaceConnection, on_delete=models.CASCADE, related_name="user_connections"
    )
    slack_user_id = models.CharField(max_length=64)
    slack_user_display_name = models.CharField(max_length=255, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="slack_user_connections",
    )
    verification_code = models.CharField(max_length=16, null=True, blank=True, db_index=True)
    code_expires_at = models.DateTimeField(null=True, blank=True)
    linked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Slack User Connection"
        verbose_name_plural = "Slack User Connections"
        db_table = "slack_user_connections"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["slack_connection", "slack_user_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_slack_user_per_connection",
            )
        ]

    def is_code_valid(self):
        return (
            self.user_id is None
            and self.verification_code
            and self.code_expires_at is not None
            and self.code_expires_at > timezone.now()
        )

    def __str__(self):
        return f"{self.slack_user_id} -> {self.user_id}"


def generate_slack_link_code():
    return "".join(secrets.choice(string.digits) for _ in range(6))


SLACK_LINK_CODE_TTL = timedelta(minutes=15)


class SlackIssueThread(ProjectBaseModel):
    """
    Bidirectional comment-sync anchor (exigence 7, 8, 9, 10 - "3. App
    Slack open-source"). One row per (issue, Slack thread root). Comments
    synced Plane->Slack are posted as thread replies keyed off
    `slack_message_ts`; replies received Slack->Plane are matched back to
    `issue` via (slack_channel_id, thread_ts) lookup on this table.

    Anti-loop (exigence 10) is NOT implemented via a flag on this table -
    it re-uses IssueComment's own pre-existing `external_source`/
    `external_id` fields (already present on this fork's IssueComment,
    unlike what the spec assumed needed adding): a comment synced FROM
    Slack is tagged `external_source="slack"`, `external_id=<ts>`, and the
    Plane->Slack sync task (bgtasks/slack_sync_task.py) refuses to
    re-forward any comment whose `external_source == "slack"`. Separately,
    the Slack->Plane direction ignores any inbound Slack event carrying a
    `bot_id` (i.e. posted by any Slack bot, including our own) - see
    SlackEventsWebhookEndpoint. Together these make the loop structurally
    one-directional per hop, not just deduplicated after the fact.
    """

    SOURCE_CHOICES = (("created_from_slack", "Created from Slack"), ("linked_manually", "Linked manually"))

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="slack_threads")
    slack_connection = models.ForeignKey(
        SlackWorkspaceConnection, on_delete=models.CASCADE, related_name="issue_threads"
    )
    slack_channel_id = models.CharField(max_length=64)
    slack_message_ts = models.CharField(max_length=32)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="linked_manually")

    class Meta:
        verbose_name = "Slack Issue Thread"
        verbose_name_plural = "Slack Issue Threads"
        db_table = "slack_issue_threads"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["slack_channel_id", "slack_message_ts"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_slack_thread_per_message",
            )
        ]
        indexes = [models.Index(fields=["issue"])]

    def __str__(self):
        return f"{self.issue_id} <-> {self.slack_channel_id}:{self.slack_message_ts}"


class EmailIssueThread(ProjectBaseModel):
    """
    14d ("Intake Email and Slack", levee du squelette, exigence 9) -
    bidirectional threading anchor for the email channel, symmetric with
    SlackIssueThread above. One row per outbound Plane notification email
    that could plausibly receive a reply: `outbound_message_id` is the
    Message-ID Plane put on that outbound email, and an inbound email
    whose `In-Reply-To`/`References` header matches it is treated as a
    reply on `issue` (a new IssueComment) rather than a new issue.

    Unlike SlackIssueThread (keyed on a Slack (channel, ts) pair that
    Slack itself gives us), there is no equivalent "receive this event
    only if it belongs to a known thread" webhook shape for email - any
    inbound email carries whatever In-Reply-To header the sending mail
    client chose to set, so `outbound_message_id` is looked up directly
    against that header value.
    """

    SOURCE_CHOICES = (("created_from_email", "Created from email"), ("linked_manually", "Linked manually"))

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="email_threads")
    intake_channel = models.ForeignKey(IntakeChannel, on_delete=models.CASCADE, related_name="email_threads")
    outbound_message_id = models.CharField(max_length=255, db_index=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="created_from_email")

    class Meta:
        verbose_name = "Email Issue Thread"
        verbose_name_plural = "Email Issue Threads"
        db_table = "email_issue_threads"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["outbound_message_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_outbound_message_id",
            )
        ]
        indexes = [models.Index(fields=["intake_channel"])]

    def __str__(self):
        return f"{self.issue_id} <-> {self.outbound_message_id}"


class SlackNotificationLog(WorkspaceBaseModel):
    """
    Optional (per spec, "facultative mais recommandee") observability
    table for outbound channel notifications and comment-sync attempts -
    lets an admin see why a channel didn't receive an expected
    notification (mapping inactive, Slack API error, token revoked)
    without grepping worker logs. No retention/purge job is implemented
    in this iteration (open question 3 in the spec) - documented gap.
    """

    STATUS_CHOICES = (("sent", "Sent"), ("failed", "Failed"))

    mapping = models.ForeignKey(
        SlackChannelProjectMapping,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notification_logs",
    )
    event_type = models.CharField(max_length=32)
    payload_summary = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="sent")
    error_message = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Slack Notification Log"
        verbose_name_plural = "Slack Notification Logs"
        db_table = "slack_notification_logs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.event_type}:{self.status} <{self.mapping_id}>"


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
