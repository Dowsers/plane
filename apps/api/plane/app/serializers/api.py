# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .base import BaseSerializer
from plane.db.models import APIToken, APIActivityLog
from rest_framework import serializers
from django.utils import timezone


class APITokenSerializer(BaseSerializer):
    class Meta:
        model = APIToken
        fields = "__all__"
        read_only_fields = [
            "token",
            "expired_at",
            "created_at",
            "updated_at",
            "workspace",
            "user",
            "is_active",
            "last_used",
            "user_type",
            # Only ever set through the dedicated agent-token-issuance
            # endpoint (plane.app.views.agent.AgentTokenListCreateEndpoint,
            # docs/feature-specs/09-ai-features.md "7. Type d'acteur agent
            # de premiere classe" in plane-selfhost), never through this
            # general-purpose personal-token PATCH.
            "agent",
            # Tier/override are only ever changed through the dedicated
            # Instance Admin (rate-limit-tiers) / Workspace Admin
            # (api-tokens/{id}/rate-limit-override) endpoints, not through
            # this general-purpose token PATCH - see
            # docs/feature-specs/08-api-webhooks-cli.md in plane-selfhost.
            "rate_limit_tier",
            "rate_limit_overridden_by",
            "rate_limit_overridden_at",
            "rate_limit_override_reason",
        ]


class APITokenReadSerializer(BaseSerializer):
    is_active = serializers.SerializerMethodField()
    rate_limit_tier_key = serializers.SerializerMethodField()
    rate_limit_effective_per_minute = serializers.SerializerMethodField()
    rate_limit_effective_per_hour = serializers.SerializerMethodField()
    rate_limit_current_usage_per_minute = serializers.SerializerMethodField()

    class Meta:
        model = APIToken
        exclude = ("token",)

    def get_is_active(self, obj: APIToken) -> bool:
        if obj.expired_at is None:
            return True
        return timezone.now() < obj.expired_at

    def _resolve_limits(self, obj: APIToken):
        # Reuses the exact same resolution order the throttle itself uses
        # (override -> explicit tier -> is_service default) so this
        # display value can never drift from what actually gets enforced.
        from plane.api.rate_limit import TieredSlidingWindowRateThrottle

        throttle = TieredSlidingWindowRateThrottle()
        return throttle.resolve_effective_limit(obj)

    def get_rate_limit_tier_key(self, obj: APIToken) -> str:
        _, _, tier_key = self._resolve_limits(obj)
        return tier_key

    def get_rate_limit_effective_per_minute(self, obj: APIToken) -> int:
        minute_limit, _, _ = self._resolve_limits(obj)
        return minute_limit

    def get_rate_limit_effective_per_hour(self, obj: APIToken) -> int:
        _, hour_limit, _ = self._resolve_limits(obj)
        return hour_limit

    def get_rate_limit_current_usage_per_minute(self, obj: APIToken) -> int:
        # Best-effort live read straight from the same Redis sorted set the
        # throttle itself maintains - never raises (fails to 0 on any
        # Redis error), this is a read-only display value, not something
        # that should ever break loading the token list.
        from plane.api.rate_limit import MINUTE_WINDOW_SECONDS
        from plane.settings.redis import redis_instance
        import time

        _, _, tier_key = self._resolve_limits(obj)
        try:
            ri = redis_instance()
            now = time.time()
            minute_key = f"rate_limit:{tier_key}:{obj.id}:minute"
            ri.zremrangebyscore(minute_key, "-inf", now - MINUTE_WINDOW_SECONDS)
            return int(ri.zcard(minute_key))
        except Exception:
            return 0


class APIActivityLogSerializer(BaseSerializer):
    class Meta:
        model = APIActivityLog
        fields = "__all__"
