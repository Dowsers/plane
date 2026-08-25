# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class Notification(BaseModel):
    workspace = models.ForeignKey("db.Workspace", related_name="notifications", on_delete=models.CASCADE)
    project = models.ForeignKey("db.Project", related_name="notifications", on_delete=models.CASCADE, null=True)
    data = models.JSONField(null=True)
    entity_identifier = models.UUIDField(null=True)
    entity_name = models.CharField(max_length=255)
    title = models.TextField()
    message = models.JSONField(null=True)
    message_html = models.TextField(blank=True, default="<p></p>")
    message_stripped = models.TextField(blank=True, null=True)
    sender = models.CharField(max_length=255)
    triggered_by = models.ForeignKey(
        "db.User",
        related_name="triggered_notifications",
        on_delete=models.SET_NULL,
        null=True,
    )
    receiver = models.ForeignKey("db.User", related_name="received_notifications", on_delete=models.CASCADE)
    read_at = models.DateTimeField(null=True)
    snoozed_till = models.DateTimeField(null=True)
    archived_at = models.DateTimeField(null=True)

    class Meta:
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"
        db_table = "notifications"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["entity_identifier"], name="notif_entity_identifier_idx"),
            models.Index(fields=["entity_name"], name="notif_entity_name_idx"),
            models.Index(fields=["read_at"], name="notif_read_at_idx"),
            models.Index(fields=["receiver", "read_at"], name="notif_entity_idx"),
            models.Index(
                fields=["receiver", "workspace", "read_at", "created_at"],
                name="notif_receiver_status_idx",
            ),
            models.Index(
                fields=["receiver", "workspace", "entity_name", "read_at"],
                name="notif_receiver_entity_idx",
            ),
            models.Index(
                fields=["receiver", "workspace", "snoozed_till", "archived_at"],
                name="notif_receiver_state_idx",
            ),
            models.Index(
                fields=["receiver", "workspace", "sender"],
                name="notif_receiver_sender_idx",
            ),
            models.Index(
                fields=["workspace", "entity_identifier", "entity_name"],
                name="notif_entity_lookup_idx",
            ),
        ]

    def __str__(self):
        """Return name of the notifications"""
        return f"{self.receiver.email} <{self.workspace.name}>"


def get_default_preference():
    return {
        "property_change": {"email": True},
        "state": {"email": True},
        "comment": {"email": True},
        "mentions": {"email": True},
    }


class UserNotificationPreference(BaseModel):
    # user it is related to
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    # workspace if it is applicable
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_notification_preferences",
        null=True,
    )
    # project
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="project_notification_preferences",
        null=True,
    )

    # preference fields
    property_change = models.BooleanField(default=True)
    state_change = models.BooleanField(default=True)
    comment = models.BooleanField(default=True)
    mention = models.BooleanField(default=True)
    issue_completed = models.BooleanField(default=True)

    # Category 10 (Docs/Wiki & Collaboration), feature 5 - "Abonnements/
    # notifications par page" (exigence 11 - opt-out, default enabled, no
    # workspace/project scoping distinct from the issue preferences
    # above). "edits" also covers the metadata-level events with no
    # dedicated toggle of their own (rename/lock/archive/access-change) -
    # see `plane.bgtasks.page_subscription_task.EVENT_PREFERENCE_FIELD`.
    page_edits = models.BooleanField(default=True)
    page_mentions = models.BooleanField(default=True)
    page_comments = models.BooleanField(default=True)

    # Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
    # plane-selfhost), feature 3 - "Notifications push en self-hosted".
    # `push_enabled` is the per-user master switch (default False - a user
    # must explicitly opt in from Profile > Notifications after granting
    # browser permission; this is NOT the instance-wide kill switch, see
    # `InstanceConfiguration.PUSH_NOTIFICATIONS_ENABLED` for that). The 5
    # `push_*` event-type toggles mirror `property_change`/`state_change`/
    # `comment`/`mention`/`issue_completed` above field-for-field but are a
    # SEPARATE channel (exigence 3 - "independantes des preferences email
    # existantes") - `plane.bgtasks.push_notification_task.
    # send_push_notification` reads these, never the email fields, and
    # vice versa for `plane.bgtasks.notification_task.notifications`'s own
    # `EmailNotificationLog` gating. Default True (opt-out per event type,
    # once the master switch itself is on) matching the email fields'
    # own default.
    push_enabled = models.BooleanField(default=False)
    push_property_change = models.BooleanField(default=True)
    push_state_change = models.BooleanField(default=True)
    push_comment = models.BooleanField(default=True)
    push_mention = models.BooleanField(default=True)
    push_issue_completed = models.BooleanField(default=True)

    # Quiet hours (exigence 2/4) - while enabled and "now" (converted to
    # `user.user_timezone`, see `plane.db.models.user.User.user_timezone`
    # - deliberately NOT a new field here, reusing the one that already
    # exists rather than adding a redundant duplicate) falls within
    # [quiet_hours_start, quiet_hours_end) (wrapping past midnight when
    # start > end, e.g. 20:00->08:00), push sending is skipped entirely -
    # the in-app `Notification` row is still created completely normally
    # (exigence 4 - no change to that path), only the push fan-out is
    # suppressed. No catch-up/digest of what was suppressed (exigence 5,
    # explicitly out of scope) - the bell is the only place a user finds
    # them afterwards.
    quiet_hours_enabled = models.BooleanField(default=False)
    quiet_hours_start = models.TimeField(null=True, blank=True)
    quiet_hours_end = models.TimeField(null=True, blank=True)

    class Meta:
        verbose_name = "UserNotificationPreference"
        verbose_name_plural = "UserNotificationPreferences"
        db_table = "user_notification_preferences"
        ordering = ("-created_at",)

    def __str__(self):
        """Return the user"""
        return f"<{self.user}>"


class EmailNotificationLog(BaseModel):
    # receiver
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_notifications",
    )
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="triggered_emails",
    )
    # entity - can be issues, pages, etc.
    entity_identifier = models.UUIDField(null=True)
    entity_name = models.CharField(max_length=255)
    # data
    data = models.JSONField(null=True)
    # sent at
    processed_at = models.DateTimeField(null=True)
    sent_at = models.DateTimeField(null=True)
    entity = models.CharField(max_length=200)
    old_value = models.CharField(max_length=300, blank=True, null=True)
    new_value = models.CharField(max_length=300, blank=True, null=True)

    class Meta:
        verbose_name = "Email Notification Log"
        verbose_name_plural = "Email Notification Logs"
        db_table = "email_notification_logs"
        ordering = ("-created_at",)
