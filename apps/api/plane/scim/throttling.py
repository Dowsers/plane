# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif", exigence 12.

Rate-limit design decision (see this feature's own commit history for the
full reasoning): category 8's `plane.api.rate_limit.
TieredSlidingWindowRateThrottle` + `RateLimitTier` model is this fork's
real, existing "per-token-type quota" mechanism - but that throttle CLASS
itself does not cleanly extend to SCIM tokens: it is hard-coupled to
`APIToken` (a plaintext `token=<value>` lookup keyed off the `X-Api-Key`
header, plus `is_service`/`rate_limit_tier`/override fields `SCIMToken`
deliberately does not have, per this feature's own spec). Rather than
bending that class to also understand a second, differently-shaped token
model, this is a genuinely new (small) throttle class that reuses:

  1. The `RateLimitTier` MODEL itself (a `scim_sync` row, seeded by
     `plane.db.migrations.0171_category11_scim`) - `RateLimitTier.key` was
     explicitly designed as a free-form slug for exactly this kind of
     future addition (see that model's own docstring).
  2. The IDENTICAL Redis sorted-set sliding-window Lua script
     (`plane.api.rate_limit._SLIDING_WINDOW_SCRIPT`) - imported directly
     rather than re-implemented, so SCIM's rate-limiting BEHAVIOR (true
     sliding window, not fixed-bucket) is byte-for-byte the same
     enforcement primitive already used and tested for personal/service
     API tokens, just applied to a different Redis key namespace
     (`rate_limit:scim_sync:<token_id>:*` vs. `rate_limit:<tier>:<token_id>:*`
     - no collision risk, `SCIMToken` and `APIToken` ids are drawn from
       disjoint UUID spaces).

Resolves the token from `request.auth` - the `SCIMToken` instance
`SCIMTokenAuthentication` already looked up and attached - rather than
re-parsing the `Authorization` header a second time.
"""

import time

from rest_framework.throttling import SimpleRateThrottle

from plane.api.rate_limit import (
    HOUR_WINDOW_SECONDS,
    MINUTE_WINDOW_SECONDS,
    _SLIDING_WINDOW_SCRIPT,
    _decode,
)
from plane.db.models import RateLimitTier
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception

SCIM_RATE_LIMIT_TIER_KEY = "scim_sync"

# Last-resort fallback only, mirroring `plane.api.rate_limit.
# FALLBACK_TIER_LIMITS`'s own precedent - used only if the seed migration's
# `scim_sync` row is somehow missing.
FALLBACK_MINUTE_LIMIT = 120
FALLBACK_HOUR_LIMIT = 5000


class SCIMTieredRateThrottle(SimpleRateThrottle):
    """Applied to every `plane.scim` view (see `SCIMBaseAPIView.
    get_throttles`). Fails OPEN on any Redis error, matching
    `TieredSlidingWindowRateThrottle`'s own documented convention and this
    fork's broader established precedent (a rate limiter should never be
    the reason a legitimate request is rejected because of infra trouble).
    """

    scope = "scim_token"

    def __init__(self):
        # Deliberately do NOT call SimpleRateThrottle.__init__ - see
        # TieredSlidingWindowRateThrottle's own identical reasoning.
        self._retry_after = None

    def get_cache_key(self, request, view):
        return None  # Unused - talks to Redis directly, see allow_request.

    def _resolve_limits(self):
        tier = RateLimitTier.objects.filter(key=SCIM_RATE_LIMIT_TIER_KEY).first()
        if tier is not None:
            return tier.requests_per_minute, tier.requests_per_hour
        return FALLBACK_MINUTE_LIMIT, FALLBACK_HOUR_LIMIT

    def allow_request(self, request, view):
        scim_token = getattr(request, "auth", None)
        if scim_token is None or not getattr(scim_token, "id", None):
            # Unreachable in practice - SCIMTokenAuthentication always
            # attaches a resolved SCIMToken as request.auth before
            # throttling runs (DRF authenticates before it throttles) -
            # but fail open defensively rather than throttle on nothing.
            return True

        minute_limit, hour_limit = self._resolve_limits()

        try:
            ri = redis_instance()
            now = time.time()
            member = f"{time.time_ns()}:{scim_token.id}"
            minute_key = f"rate_limit:{SCIM_RATE_LIMIT_TIER_KEY}:{scim_token.id}:minute"
            hour_key = f"rate_limit:{SCIM_RATE_LIMIT_TIER_KEY}:{scim_token.id}:hour"
            raw = ri.eval(
                _SLIDING_WINDOW_SCRIPT,
                2,
                minute_key,
                hour_key,
                str(now),
                MINUTE_WINDOW_SECONDS,
                minute_limit,
                HOUR_WINDOW_SECONDS,
                hour_limit,
                member,
            )
        except Exception as e:
            log_exception(e, warning=True)
            return True  # Fail open - see class docstring.

        allowed = int(raw[0]) == 1
        minute_count = int(raw[1])
        oldest_minute = float(_decode(raw[3]))
        oldest_hour = float(_decode(raw[4]))
        blocked_by = _decode(raw[5])

        reset_time = (
            int(oldest_minute + MINUTE_WINDOW_SECONDS) if oldest_minute != -1 else int(now + MINUTE_WINDOW_SECONDS)
        )
        request.META["X-RateLimit-Limit"] = minute_limit
        request.META["X-RateLimit-Remaining"] = max(0, minute_limit - minute_count)
        request.META["X-RateLimit-Reset"] = reset_time

        if not allowed:
            if blocked_by == "hour":
                self._retry_after = max(1, int(oldest_hour + HOUR_WINDOW_SECONDS - now))
            else:
                self._retry_after = max(1, int(oldest_minute + MINUTE_WINDOW_SECONDS - now))

        return allowed

    def wait(self):
        return self._retry_after
