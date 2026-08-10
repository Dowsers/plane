# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from uuid import uuid4

# Django imports
from django.db import models
from django.conf import settings

from .base import BaseModel


def generate_label_token():
    return uuid4().hex


def generate_token():
    return "plane_api_" + uuid4().hex


class APIToken(BaseModel):
    # Meta information
    label = models.CharField(max_length=255, default=generate_label_token)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    last_used = models.DateTimeField(null=True)

    # Token
    token = models.CharField(max_length=255, unique=True, default=generate_token, db_index=True)

    # User Information
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bot_tokens")
    user_type = models.PositiveSmallIntegerField(choices=((0, "Human"), (1, "Bot")), default=0)
    workspace = models.ForeignKey("db.Workspace", related_name="api_tokens", on_delete=models.CASCADE, null=True)
    expired_at = models.DateTimeField(blank=True, null=True)
    is_service = models.BooleanField(default=False)
    # "N/period" DRF SimpleRateThrottle-compatible string (e.g. "60/min").
    # Historically written by the serializer/PATCH endpoint but never read
    # by any throttle class - see `rate_limit_overridden_at` below for how
    # this is now made meaningful without breaking existing rows that all
    # already carry the "60/min" default.
    allowed_rate_limit = models.CharField(max_length=255, default="60/min")
    # Resolved tier for this token. Nullable by design (exigence 9,
    # backward-compatible migration): a NULL value here does not mean "no
    # limit", it means "resolve the default tier for this token's type at
    # read time" - see `plane.api.rate_limit.TieredSlidingWindowRateThrottle`.
    # No backfill data-migration writes this on existing rows; resolution
    # happens live via `is_service`, matching how that field itself is
    # already branched on today in `BaseAPIView.get_throttles`.
    rate_limit_tier = models.ForeignKey(
        "db.RateLimitTier",
        related_name="api_tokens",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    # Traceability for a Workspace Admin's per-token override (spec
    # exigence 8). `allowed_rate_limit` is ONLY treated as an active
    # override when `rate_limit_overridden_at` is set - its field default
    # ("60/min") is present on every pre-existing row and must NOT itself
    # be mistaken for an admin-set override.
    rate_limit_overridden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="rate_limit_overrides_made",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    rate_limit_overridden_at = models.DateTimeField(blank=True, null=True)
    rate_limit_override_reason = models.TextField(blank=True, default="")

    class Scope(models.TextChoices):
        READ_WRITE = "read_write", "Read & Write"
        READ_ONLY = "read_only", "Read Only"

    # Real DRF-layer enforcement, not a display-only flag - see
    # `plane.api.views.base.APITokenScopePermission`, added to
    # `BaseAPIView.permission_classes` (applies to every plane.api view,
    # not opted-in per-view) so a read_only token is rejected on any
    # mutating method regardless of which of the 180+ endpoints it hits.
    # Default read_write preserves today's behavior for every pre-existing
    # token on migrate - only newly-issued explorer ephemeral tokens (see
    # docs/feature-specs/08-api-webhooks-cli.md "6. Explorateur d'API
    # interactif" in plane-selfhost) are expected to ever request
    # read_only in practice, but the field is general-purpose.
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.READ_WRITE)
    # Distinguishes an explorer-issued, short-lived token (auto-expired via
    # `expired_at`, never intended to be reused after that) from a normal
    # long-lived personal/service token - purely informational today (e.g.
    # for a future "revoke all ephemeral tokens" admin action), expiry
    # itself is already enforced through the pre-existing `expired_at`
    # field/`APIKeyAuthentication.validate_api_token` query, not this flag.
    is_ephemeral = models.BooleanField(default=False)

    class Meta:
        verbose_name = "API Token"
        verbose_name_plural = "API Tokems"
        db_table = "api_tokens"
        ordering = ("-created_at",)

    def __str__(self):
        return str(self.user.id)


class APIActivityLog(BaseModel):
    token_identifier = models.CharField(max_length=255)

    # Request Info
    path = models.CharField(max_length=255)
    method = models.CharField(max_length=10)
    query_params = models.TextField(null=True, blank=True)
    headers = models.TextField(null=True, blank=True)
    body = models.TextField(null=True, blank=True)

    # Response info
    response_code = models.PositiveIntegerField()
    response_body = models.TextField(null=True, blank=True)

    # Meta information
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, null=True, blank=True)

    # Added for the API Explorer's request-logging requirement (spec
    # exigence 12, docs/feature-specs/08-api-webhooks-cli.md "6.
    # Explorateur d'API interactif" in plane-selfhost) rather than a new
    # `APIExplorerRequestLog` model - this table already captures
    # method/path/status/headers/user_agent per X-Api-Key request via
    # `plane.middleware.logger.APITokenLogMiddleware`; it only lacked a
    # workspace reference, a duration, and a way to tag *why* a row was
    # logged. All three are nullable/optional so every pre-existing row
    # (and every row written by that older, unrelated middleware) is
    # unaffected. `created_by` (already on BaseModel) doubles as the
    # "actor" the spec's own `APIExplorerRequestLog` proposal asked for.
    workspace = models.ForeignKey(
        "db.Workspace",
        related_name="api_activity_logs",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    # e.g. "api_explorer" - see
    # `plane.middleware.api_explorer_logging.APIExplorerActivityLogMiddleware`.
    # Left blank (not defaulted to some "integration" sentinel) for every
    # row written by the pre-existing, unconditional
    # `APITokenLogMiddleware` above, so a simple `source="api_explorer"`
    # filter is exactly the set of requests the spec asks admins to be
    # able to distinguish - nothing more.
    source = models.CharField(max_length=50, null=True, blank=True, db_index=True)

    class Meta:
        verbose_name = "API Activity Log"
        verbose_name_plural = "API Activity Logs"
        db_table = "api_activity_logs"
        ordering = ("-created_at",)

    def __str__(self):
        return str(self.token_identifier)
