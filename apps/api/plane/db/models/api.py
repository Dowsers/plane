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

    class Meta:
        verbose_name = "API Activity Log"
        verbose_name_plural = "API Activity Logs"
        db_table = "api_activity_logs"
        ordering = ("-created_at",)

    def __str__(self):
        return str(self.token_identifier)
