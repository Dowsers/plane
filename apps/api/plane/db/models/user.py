# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import random
import string
import uuid

import pytz
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, UserManager

# Django imports
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

# Module imports
from plane.db.models import FileAsset
from ..mixins import TimeAuditModel
from plane.utils.color import get_random_color


def get_default_onboarding():
    return {
        "profile_complete": False,
        "workspace_create": False,
        "workspace_invite": False,
        "workspace_join": False,
    }


def get_mobile_default_onboarding():
    return {
        "profile_complete": False,
        "workspace_create": False,
        "workspace_join": False,
    }


def get_default_product_tour():
    return {
        "work_items": False,
        "cycles": False,
        "modules": False,
        "intake": False,
        "pages": False,
    }


class BotTypeEnum(models.TextChoices):
    WORKSPACE_SEED = "WORKSPACE_SEED", "Workspace Seed"
    # Category 7 integration connectors (docs/feature-specs/07-integrations-git.md
    # in plane-selfhost) - see plane.utils.integration_bot for the shared
    # get-or-create helper all of these are created through.
    GITHUB_BOT = "GITHUB_BOT", "GitHub Bot"
    GITLAB_BOT = "GITLAB_BOT", "GitLab Bot"
    SLACK_BOT = "SLACK_BOT", "Slack Bot"
    FIGMA_BOT = "FIGMA_BOT", "Figma Bot"
    SENTRY_BOT = "SENTRY_BOT", "Sentry Bot"
    SUPPORT_BOT = "SUPPORT_BOT", "Support Bot"
    # Category 9 feature 7 (docs/feature-specs/09-ai-features.md "7. Type
    # d'acteur agent de premiere classe" in plane-selfhost) - unlike every
    # bot type above, a WORKSPACE_AGENT is deliberately member-visible
    # (assignable, mentionable, shows up in member lists) - see
    # plane.utils.agent_actor. It is also the only bot type that is ever
    # blocked from role=20/Admin - the bots above keep their existing
    # role=20 membership unchanged (plane.utils.integration_bot).
    WORKSPACE_AGENT = "WORKSPACE_AGENT", "Workspace Agent"
    # Category 9 feature 1 (docs/feature-specs/09-ai-features.md "1.
    # Auto-triage assiste par IA" in plane-selfhost, exigence 6) - the
    # dedicated system actor auto-applied module/assignee/label
    # suggestions are attributed to on the `IssueActivity` feed, created/
    # fetched via the same `get_or_create_integration_bot` factory as the
    # category 7 bots above (plane.utils.integration_bot) rather than a
    # new bot-creation mechanism. Unlike WORKSPACE_AGENT, this bot is not
    # meant to be member-visible/assignable - it exists purely to be an
    # `IssueActivity.actor` distinguishable from a human.
    AI_TRIAGE_BOT = "AI_TRIAGE_BOT", "AI Triage Bot"
    # Category 9 feature 3 (docs/feature-specs/09-ai-features.md "3.
    # Assistant de chat IA in-app" in plane-selfhost) - the in-app chat
    # assistant's own actor identity, used so it can post its own reply
    # messages as a real `IssueComment` author when @mentioned in a
    # comment thread. Unlike `AI_TRIAGE_BOT` (never member-visible/
    # mentionable) but LIKE `WORKSPACE_AGENT`, this bot type IS
    # deliberately member-visible/mentionable via the `@AI Assistant`
    # autocomplete - see `plane.utils.agent_actor`'s
    # `PUBLICLY_VISIBLE_BOT_TYPES` (generalized to a set for exactly this
    # second bot type rather than hardcoding WORKSPACE_AGENT alone).
    # Created/fetched via the same `get_or_create_integration_bot` factory
    # as every bot type above - no new bot-creation mechanism.
    AI_ASSISTANT_BOT = "AI_ASSISTANT_BOT", "AI Assistant Bot"


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True, primary_key=True)
    username = models.CharField(max_length=128, unique=True)
    # user fields
    mobile_number = models.CharField(max_length=255, blank=True, null=True)
    email = models.CharField(max_length=255, null=True, blank=True, unique=True)

    # identity
    display_name = models.CharField(max_length=255, default="")
    first_name = models.CharField(max_length=255, blank=True)
    last_name = models.CharField(max_length=255, blank=True)
    # avatar
    avatar = models.TextField(blank=True)
    avatar_asset = models.ForeignKey(
        FileAsset,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_avatar",
    )
    # cover image
    cover_image = models.URLField(blank=True, null=True, max_length=800)
    cover_image_asset = models.ForeignKey(
        FileAsset,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_cover_image",
    )

    # tracking metrics
    date_joined = models.DateTimeField(auto_now_add=True, verbose_name="Created At")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Last Modified At")
    last_location = models.CharField(max_length=255, blank=True)
    created_location = models.CharField(max_length=255, blank=True)

    # the is' es
    is_superuser = models.BooleanField(default=False)
    is_managed = models.BooleanField(default=False)
    is_password_expired = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    is_password_autoset = models.BooleanField(default=False)
    is_password_reset_required = models.BooleanField(default=False)
    # random token generated
    token = models.CharField(max_length=64, blank=True)

    last_active = models.DateTimeField(default=timezone.now, null=True)
    last_login_time = models.DateTimeField(null=True)
    last_logout_time = models.DateTimeField(null=True)
    last_login_ip = models.CharField(max_length=255, blank=True)
    last_logout_ip = models.CharField(max_length=255, blank=True)
    last_login_medium = models.CharField(max_length=20, default="email")
    last_login_uagent = models.TextField(blank=True)
    token_updated_at = models.DateTimeField(null=True)
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 6 ("Politiques de securite configurables"),
    # exigence 8 - "moment of last REAL authentication", read by
    # `plane.utils.reauth.is_reauth_stale`. Deliberately a NEW, separate
    # field rather than reusing `token_updated_at` above - empirically
    # confirmed (a throwaway pytest probe, since deleted) that
    # `token_updated_at` is silently bumped to `now()` by this model's own
    # `save()` override on ANY save where it is already non-null in
    # memory, not only at real login - e.g. a routine `PATCH /api/users/me/`
    # profile edit (`UserEndpoint.partial_update`, a plain `ModelViewSet`
    # `serializer.save()`) goes through this exact `save()` override too,
    # so `token_updated_at` does NOT reliably mean "last real
    # authentication" - reusing it as-is for a security re-auth gate would
    # have been dishonest (the 15-minute staleness window would almost
    # never actually trigger for an active user touching any of their own
    # settings). This field is written ONLY via `.update()` at the
    # queryset level (bypassing `save()` entirely, never sending
    # `post_save`) at the two real call sites that constitute "the user
    # just proved who they are": `plane.authentication.utils.login.
    # user_login()` (every real login, all providers) and
    # `plane.utils.reauth.mark_reauthenticated()` (the re-auth challenge
    # endpoint) - nothing else in this codebase ever touches it.
    last_authenticated_at = models.DateTimeField(null=True, blank=True)
    # my_issues_prop = models.JSONField(null=True)

    is_bot = models.BooleanField(default=False)
    bot_type = models.CharField(max_length=30, verbose_name="Bot Type", blank=True, null=True)

    # timezone
    USER_TIMEZONE_CHOICES = tuple(zip(pytz.common_timezones, pytz.common_timezones))
    user_timezone = models.CharField(max_length=255, default="UTC", choices=USER_TIMEZONE_CHOICES)

    # email validation
    is_email_valid = models.BooleanField(default=False)

    # masking
    masked_at = models.DateTimeField(null=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    objects = UserManager()

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        db_table = "users"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.username} <{self.email}>"

    @property
    def avatar_url(self):
        # Return the logo asset url if it exists
        if self.avatar_asset:
            return self.avatar_asset.asset_url

        # Return the logo url if it exists
        if self.avatar:
            return self.avatar
        return None

    @property
    def cover_image_url(self):
        # Return the logo asset url if it exists
        if self.cover_image_asset:
            return self.cover_image_asset.asset_url

        # Return the logo url if it exists
        if self.cover_image:
            return self.cover_image
        return None

    @property
    def full_name(self):
        """Return user's full name (first + last)."""
        return f"{self.first_name} {self.last_name}".strip()

    def save(self, *args, **kwargs):
        self.email = self.email.lower().strip()
        self.mobile_number = self.mobile_number

        if self.token_updated_at is not None:
            self.token = uuid.uuid4().hex + uuid.uuid4().hex
            self.token_updated_at = timezone.now()

        if not self.display_name:
            self.display_name = (
                self.email.split("@")[0]
                if len(self.email.split("@"))
                else "".join(random.choice(string.ascii_letters) for _ in range(6))
            )

        if self.is_superuser:
            self.is_staff = True

        super(User, self).save(*args, **kwargs)

    @classmethod
    def get_display_name(cls, email):
        if not email:
            return "".join(random.choice(string.ascii_letters) for _ in range(6))
        return (
            email.split("@")[0]
            if len(email.split("@")) == 2
            else "".join(random.choice(string.ascii_letters) for _ in range(6))
        )


class Profile(TimeAuditModel):
    SUNDAY = 0
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    SATURDAY = 6

    class NotificationViewMode(models.TextChoices):
        FULL = "full", "Full"
        COMPACT = "compact", "Compact"

    START_OF_THE_WEEK_CHOICES = (
        (SUNDAY, "Sunday"),
        (MONDAY, "Monday"),
        (TUESDAY, "Tuesday"),
        (WEDNESDAY, "Wednesday"),
        (THURSDAY, "Thursday"),
        (FRIDAY, "Friday"),
        (SATURDAY, "Saturday"),
    )

    id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True, primary_key=True)
    # User
    user = models.OneToOneField("db.User", on_delete=models.CASCADE, related_name="profile")
    # General
    theme = models.JSONField(default=dict)
    is_app_rail_docked = models.BooleanField(default=True)
    # Onboarding
    is_tour_completed = models.BooleanField(default=False)
    onboarding_step = models.JSONField(default=get_default_onboarding)
    use_case = models.TextField(blank=True, null=True)
    role = models.CharField(max_length=300, null=True, blank=True)  # job role
    is_onboarded = models.BooleanField(default=False)
    # Last visited workspace
    last_workspace_id = models.UUIDField(null=True)
    # address data
    billing_address_country = models.CharField(max_length=255, default="INDIA")
    billing_address = models.JSONField(null=True)
    has_billing_address = models.BooleanField(default=False)
    company_name = models.CharField(max_length=255, blank=True)
    notification_view_mode = models.CharField(
        max_length=255, choices=NotificationViewMode.choices, default=NotificationViewMode.FULL
    )
    is_smooth_cursor_enabled = models.BooleanField(default=False)
    # mobile
    is_mobile_onboarded = models.BooleanField(default=False)
    mobile_onboarding_step = models.JSONField(default=get_mobile_default_onboarding)
    mobile_timezone_auto_set = models.BooleanField(default=False)
    # language
    language = models.CharField(max_length=255, default="en")
    start_of_the_week = models.PositiveSmallIntegerField(choices=START_OF_THE_WEEK_CHOICES, default=SUNDAY)
    goals = models.JSONField(default=dict)
    background_color = models.CharField(max_length=255, default=get_random_color)

    # navigation tour
    is_navigation_tour_completed = models.BooleanField(default=False)

    # marketing
    has_marketing_email_consent = models.BooleanField(default=False)
    is_subscribed_to_changelog = models.BooleanField(default=False)
    product_tour = models.JSONField(default=get_default_product_tour)

    class Meta:
        verbose_name = "Profile"
        verbose_name_plural = "Profiles"
        db_table = "profiles"
        ordering = ("-created_at",)


class Account(TimeAuditModel):
    PROVIDER_CHOICES = (
        ("google", "Google"),
        ("github", "Github"),
        ("gitlab", "GitLab"),
    )

    id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True, primary_key=True)
    user = models.ForeignKey("db.User", on_delete=models.CASCADE, related_name="accounts")
    provider_account_id = models.CharField(max_length=255)
    provider = models.CharField(choices=PROVIDER_CHOICES)
    access_token = models.TextField()
    access_token_expired_at = models.DateTimeField(null=True)
    refresh_token = models.TextField(null=True, blank=True)
    refresh_token_expired_at = models.DateTimeField(null=True)
    last_connected_at = models.DateTimeField(default=timezone.now)
    id_token = models.TextField(blank=True)
    metadata = models.JSONField(default=dict)

    class Meta:
        unique_together = ["provider", "provider_account_id"]
        verbose_name = "Account"
        verbose_name_plural = "Accounts"
        db_table = "accounts"
        ordering = ("-created_at",)


@receiver(post_save, sender=User)
def create_user_notification(sender, instance, created, **kwargs):
    # create preferences
    #
    # A WORKSPACE_AGENT (and, since category 9 feature 3, AI_ASSISTANT_BOT
    # too) still needs a preference row even though it's a bot: unlike
    # every other bot type these are member-visible and mentionable (see
    # plane.utils.agent_actor.PUBLICLY_VISIBLE_BOT_TYPES), so
    # notification_task's `UserNotificationPreference.objects.get(user_id=
    # mention_id)` would otherwise raise DoesNotExist and blow up the
    # whole notification task the first time a human @-mentions one of
    # them. Local import to avoid a circular import (agent_actor imports
    # BotTypeEnum from this module).
    from plane.utils.agent_actor import PUBLICLY_VISIBLE_BOT_TYPES

    if created and (not instance.is_bot or instance.bot_type in PUBLICLY_VISIBLE_BOT_TYPES):
        # Module imports
        from plane.db.models import UserNotificationPreference

        UserNotificationPreference.objects.create(
            user=instance,
            property_change=True,
            state_change=True,
            comment=True,
            mention=True,
            issue_completed=True,
        )
