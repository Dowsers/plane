# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# See docs/feature-specs/08-api-webhooks-cli.md ("2. Rate limiting plus
# genereux") in plane-selfhost for the full feature spec this implements.

# python imports
import os
import secrets
import time

# Third party imports
from rest_framework.throttling import SimpleRateThrottle

# Module imports
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception

MINUTE_WINDOW_SECONDS = 60
HOUR_WINDOW_SECONDS = 60 * 60

# Absolute last-resort fallback, only used if the `RateLimitTier` seed rows
# are somehow missing (e.g. a fresh DB the seed data migration never ran
# against). Mirrors the hardcoded values this fork used before this
# feature existed - 60/min personal token, 300/min service token - so a
# missing tier row degrades to today's exact behavior instead of a crash.
FALLBACK_TIER_LIMITS = {
    "service_account": (300, 300 * 60),
    "personal_token": (60, 60 * 60),
}

# Lua script executed atomically (single EVAL = single Redis command, no
# race between the read-count and the write-add) implementing a sliding
# window log against two independent sorted sets (one per window length)
# for the same token. Unlike a fixed window (this fork's previous
# `SimpleRateThrottle`-based bucket, keyed by whole-minute buckets via
# Django's cache backend), this never lets a caller burst 2x its limit by
# straddling a window boundary (see exigence 4) - every request only ever
# "sees" the trailing N seconds, not the current fixed bucket.
#
# KEYS[1] = minute-window sorted-set key
# KEYS[2] = hour-window sorted-set key
# ARGV[1] = now (float unix seconds)
# ARGV[2] = minute window length (seconds)
# ARGV[3] = minute limit
# ARGV[4] = hour window length (seconds)
# ARGV[5] = hour limit
# ARGV[6] = member to add if the request is allowed
#
# Returns: {allowed(0/1), minute_count, hour_count, oldest_minute_score,
#           oldest_hour_score, blocked_by} - the two "oldest_*_score"
# values are stringified (Lua->RESP integer conversion truncates floats,
# so scores are round-tripped as strings and float()'d back in Python) and
# are "-1" when the relevant set is empty.
_SLIDING_WINDOW_SCRIPT = """
local minute_key = KEYS[1]
local hour_key = KEYS[2]
local now = tonumber(ARGV[1])
local minute_window = tonumber(ARGV[2])
local minute_limit = tonumber(ARGV[3])
local hour_window = tonumber(ARGV[4])
local hour_limit = tonumber(ARGV[5])
local member = ARGV[6]

redis.call('ZREMRANGEBYSCORE', minute_key, '-inf', now - minute_window)
redis.call('ZREMRANGEBYSCORE', hour_key, '-inf', now - hour_window)

local minute_count = redis.call('ZCARD', minute_key)
local hour_count = redis.call('ZCARD', hour_key)

local allowed = 1
local blocked_by = 'none'
if minute_count >= minute_limit then
    allowed = 0
    blocked_by = 'minute'
elseif hour_count >= hour_limit then
    allowed = 0
    blocked_by = 'hour'
end

local oldest_minute = -1
local first_minute = redis.call('ZRANGE', minute_key, 0, 0, 'WITHSCORES')
if first_minute[2] ~= nil then oldest_minute = tonumber(first_minute[2]) end

local oldest_hour = -1
local first_hour = redis.call('ZRANGE', hour_key, 0, 0, 'WITHSCORES')
if first_hour[2] ~= nil then oldest_hour = tonumber(first_hour[2]) end

if allowed == 1 then
    redis.call('ZADD', minute_key, now, member)
    redis.call('EXPIRE', minute_key, minute_window)
    redis.call('ZADD', hour_key, now, member)
    redis.call('EXPIRE', hour_key, hour_window)
    minute_count = minute_count + 1
    hour_count = hour_count + 1
    if oldest_minute == -1 then oldest_minute = now end
    if oldest_hour == -1 then oldest_hour = now end
end

return {allowed, minute_count, hour_count, tostring(oldest_minute), tostring(oldest_hour), blocked_by}
"""


def _decode(value):
    return value.decode() if isinstance(value, bytes) else value


class TieredSlidingWindowRateThrottle(SimpleRateThrottle):
    """
    Redis sorted-set sliding-window throttle keyed by the resolved
    `APIToken`, replacing the old fixed-window `ApiKeyRateThrottle` /
    `ServiceTokenRateThrottle` pair for any request authenticated via
    `X-Api-Key`. Handles both personal and service tokens - the effective
    limit is resolved per-token (see `resolve_effective_limit`), so the
    two old, near-duplicate classes collapse into this one.

    Effective limit resolution order (exigence 2, 8, 9):
      1. Explicit per-token override: `APIToken.allowed_rate_limit`, but
         ONLY when `rate_limit_overridden_at` is set - the field's
         "60/min" default is present on every row (old and new) and must
         never itself be mistaken for an admin-set override.
      2. `APIToken.rate_limit_tier` (explicit FK), if an admin set one.
      3. The default tier resolved by `APIToken.is_service` at read time
         (`service_account` vs `personal_token`) - no backfill migration
         needed, mirrors how `is_service` is already branched on today.

    Fails OPEN on any Redis error - see
    `plane/utils/workflow_rule_engine.py::_check_rate_limit` for the one
    other sliding-window-adjacent precedent in this codebase, which
    established this exact convention ("a rate limiter should never be
    the reason a legitimate request is rejected because of infra
    trouble"). The spec itself flags fail-open vs fail-closed as an open
    question for self-hosted instances; this feature makes a firm decision
    to follow the existing precedent rather than add a new
    `RATE_LIMIT_FAIL_MODE` instance-config toggle for it.
    """

    scope = "api_token"

    def __init__(self):
        # Deliberately do NOT call SimpleRateThrottle.__init__ - it calls
        # self.get_rate() -> self.THROTTLE_RATES[self.scope], which
        # requires `scope` to be registered in DEFAULT_THROTTLE_RATES.
        # This class resolves its rate per-token instead, not per-scope.
        self.token = None
        self._retry_after = None

    def get_cache_key(self, request, view):
        # Unused - this throttle talks to Redis directly (see
        # allow_request) instead of going through SimpleRateThrottle's own
        # cache-backed fixed-window bucket. Required by the abstract base
        # class signature only.
        return None

    def resolve_effective_limit(self, token):
        """Returns (minute_limit, hour_limit, tier_key_for_redis_namespacing)."""
        if token.rate_limit_overridden_at is not None and token.allowed_rate_limit:
            try:
                num_requests, duration = self.parse_rate(token.allowed_rate_limit)
            except (ValueError, KeyError, IndexError, TypeError):
                num_requests, duration = None, None
            if num_requests is not None and duration:
                # `allowed_rate_limit` is a generic "N/period" string - an
                # admin could write "60/min" or "1000/hour". Scale
                # whichever unit was used onto both windows this throttle
                # actually enforces, so the override behaves coherently
                # regardless of which unit the admin chose.
                per_second = num_requests / duration
                minute_limit = max(1, round(per_second * MINUTE_WINDOW_SECONDS))
                hour_limit = max(1, round(per_second * HOUR_WINDOW_SECONDS))
                return minute_limit, hour_limit, "override"

        tier = token.rate_limit_tier
        if tier is None:
            from plane.db.models import RateLimitTier

            tier_key = "service_account" if token.is_service else "personal_token"
            tier = RateLimitTier.objects.filter(key=tier_key).first()

        if tier is not None:
            return tier.requests_per_minute, tier.requests_per_hour, tier.key

        fallback_key = "service_account" if token.is_service else "personal_token"
        minute_limit, hour_limit = FALLBACK_TIER_LIMITS[fallback_key]
        return minute_limit, hour_limit, fallback_key

    def allow_request(self, request, view):
        from plane.db.models import APIToken

        api_key = request.headers.get("X-Api-Key")
        if not api_key:
            # Shouldn't be reachable in practice - BaseAPIView only picks
            # this throttle when an X-Api-Key header is present - but fail
            # open defensively rather than throttle on nothing.
            return True

        token = APIToken.objects.filter(token=api_key).select_related("rate_limit_tier").first()
        if token is None:
            # Authentication already validated this exact header value
            # before throttling ever runs (DRF calls perform_authentication
            # before check_throttles) - this should be unreachable, but
            # fail open rather than 429 a request we can't even resolve.
            return True

        self.token = token
        minute_limit, hour_limit, tier_key = self.resolve_effective_limit(token)

        try:
            ri = redis_instance()
            now = time.time()
            member = f"{time.time_ns()}:{secrets.token_hex(4)}"
            minute_key = f"rate_limit:{tier_key}:{token.id}:minute"
            hour_key = f"rate_limit:{tier_key}:{token.id}:hour"
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
            # Fail open (see class docstring) - also make sure a Redis
            # outage doesn't leave stale headers from a previous request
            # hanging around.
            request.META["X-RateLimit-Limit"] = minute_limit
            return True

        allowed = int(raw[0]) == 1
        minute_count = int(raw[1])
        # raw[2] (hour_count) is intentionally unused - only the minute
        # window is surfaced via X-RateLimit-* headers, matching this
        # fork's pre-existing per-minute header convention; the hour
        # window still independently gates `allowed`/`blocked_by` above.
        oldest_minute = float(_decode(raw[3]))
        oldest_hour = float(_decode(raw[4]))
        blocked_by = _decode(raw[5])

        if oldest_minute != -1:
            reset_time = int(oldest_minute + MINUTE_WINDOW_SECONDS)
        else:
            reset_time = int(now + MINUTE_WINDOW_SECONDS)

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


# Cost-weighted budget (points/hour) used when no `RateLimitTier` row
# resolves (or resolves but leaves `complexity_points_per_hour` unset) -
# see FlexibleQueryCostThrottle below.
FLEXIBLE_QUERY_COST_FALLBACK_BUDGET = int(os.environ.get("FLEXIBLE_QUERY_COST_BUDGET_PER_HOUR", "50000"))
FLEXIBLE_QUERY_COST_WINDOW_SECONDS = HOUR_WINDOW_SECONDS

# Same Redis sorted-set sliding-window idiom as _SLIDING_WINDOW_SCRIPT
# above, but tracking a SUM of per-request cost within the window rather
# than a plain member COUNT - each member encodes its own cost as a
# "<cost>:<unique-suffix>" string (score is still the timestamp, used only
# for expiry), and the script sums the cost prefix of every live member on
# each check. O(members-in-window) per call rather than O(1) like the
# count-only script - acceptable at this endpoint's expected volume (an
# hourly window, not a hot per-request path), and avoids a second
# long-lived counter key that could drift from the sorted set's own
# expiry.
#
# KEYS[1] = cost sliding-window sorted-set key
# ARGV[1] = now (float unix seconds)
# ARGV[2] = window length (seconds)
# ARGV[3] = budget (cost points allowed per window)
# ARGV[4] = this request's cost
# ARGV[5] = unique suffix for the member added if the request is allowed
#
# Returns: {allowed(0/1), used_cost_after_this_request, oldest_score_or_-1}
_COST_SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local budget = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local suffix = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

local entries = redis.call('ZRANGE', key, 0, -1)
local used = 0
for i = 1, #entries do
    local member = entries[i]
    local sep = string.find(member, ':', 1, true)
    local member_cost = tonumber(string.sub(member, 1, sep - 1))
    used = used + member_cost
end

local allowed = 0
if used + cost <= budget then
    allowed = 1
end

local oldest = -1
local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
if first[2] ~= nil then oldest = tonumber(first[2]) end

if allowed == 1 then
    local member = tostring(cost) .. ':' .. suffix
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, window)
    used = used + cost
    if oldest == -1 then oldest = now end
end

return {allowed, used, tostring(oldest)}
"""


class FlexibleQueryCostThrottle(SimpleRateThrottle):
    """
    Cost-weighted sliding-window throttle for
    `POST /api/v1/workspaces/{slug}/query/` - see
    docs/feature-specs/08-api-webhooks-cli.md ("Couche de requetes flexible
    facon GraphQL", exigence 10) in plane-selfhost: this endpoint's budget
    is spent proportionally to each request's own computed cost (product
    of `limit`s across the requested nesting, see
    `plane/utils/flexible_query/cost.py`) instead of "1 request = 1 unit",
    REPLACING (not stacking on top of) the flat/tiered per-request throttle
    above for this one endpoint - `FlexibleQueryEndpoint.get_throttles()`
    (api/views/flexible_query.py) returns only this class, skipping
    `TieredSlidingWindowRateThrottle` entirely for this specific view.

    INTEGRATION WITH `TieredSlidingWindowRateThrottle` (same file, above):
    that class and `RateLimitTier` (db/models/rate_limit.py) both landed in
    this fork in parallel with this feature, for the separate "Rate
    limiting plus genereux" feature. `RateLimitTier.complexity_points_per_hour`
    was already reserved there, unset/unused, with a docstring explicitly
    calling out "a future complexity scoring engine" - this class is that
    consumer: it resolves the caller's tier via the exact same rule
    `resolve_effective_limit` uses for its own two tiers (explicit
    `APIToken.rate_limit_tier` FK, else default-by-`is_service`), then
    spends `complexity_points_per_hour` from that row instead of inventing
    a separate tier/config mechanism. Falls back to
    `FLEXIBLE_QUERY_COST_BUDGET_PER_HOUR` (env var, default 50000/hour)
    when no tier row resolves or the field is left null - both realistic
    for a fresh instance where the seed migration for that other feature
    has not populated `complexity_points_per_hour` yet. Deliberately does
    NOT reuse `_SLIDING_WINDOW_SCRIPT`/its Redis keys above (this is a
    genuinely different metric - cost sum, not request count - tracked
    under its own `flexible_query_cost:*` key namespace) and does NOT
    duplicate the requests_per_minute/requests_per_hour enforcement those
    already do for every *other* endpoint - only this endpoint's own
    count-based throttle is being replaced, per the spec's own wording.
    Fails open on any Redis error, matching `TieredSlidingWindowRateThrottle`'s
    own documented convention for exactly the same reason.
    """

    scope = "flexible_query_cost"

    def __init__(self):
        self._retry_after = None

    def get_cache_key(self, request, view):
        # Unused - talks to Redis directly (see allow_request), same as
        # TieredSlidingWindowRateThrottle. Required by the base class.
        return None

    def _resolve_budget(self, token):
        tier = token.rate_limit_tier
        if tier is None:
            from plane.db.models import RateLimitTier

            tier_key = "service_account" if token.is_service else "personal_token"
            tier = RateLimitTier.objects.filter(key=tier_key).first()
        if tier is not None and tier.complexity_points_per_hour:
            return tier.complexity_points_per_hour
        return FLEXIBLE_QUERY_COST_FALLBACK_BUDGET

    def allow_request(self, request, view, cost=1):
        """Called explicitly by `FlexibleQueryEndpoint.post` once the
        request's cost is known (after depth/cost validation, before any
        query executes) - NOT wired into DRF's automatic `get_throttles()`
        pipeline, since that runs before the request body has even been
        parsed and the cost cannot be known yet at that point."""
        from plane.db.models import APIToken

        api_key = request.headers.get("X-Api-Key")
        if not api_key:
            # Unreachable in practice - this endpoint requires
            # APIKeyAuthentication + IsAuthenticated, same as every other
            # plane.api view - but fail open rather than throttle on nothing.
            return True

        token = APIToken.objects.filter(token=api_key).select_related("rate_limit_tier").first()
        if token is None:
            return True

        budget = self._resolve_budget(token)

        try:
            ri = redis_instance()
            now = time.time()
            suffix = f"{time.time_ns()}:{secrets.token_hex(4)}"
            key = f"flexible_query_cost:{token.id}"
            raw = ri.eval(
                _COST_SLIDING_WINDOW_SCRIPT,
                1,
                key,
                str(now),
                FLEXIBLE_QUERY_COST_WINDOW_SECONDS,
                budget,
                cost,
                suffix,
            )
        except Exception as e:
            log_exception(e, warning=True)
            return True  # fail open - see class docstring

        allowed = int(raw[0]) == 1
        used = int(raw[1])
        oldest = float(_decode(raw[2]))
        reset_time = int(oldest + FLEXIBLE_QUERY_COST_WINDOW_SECONDS) if oldest != -1 else int(
            now + FLEXIBLE_QUERY_COST_WINDOW_SECONDS
        )

        request.META["X-RateLimit-Cost-Limit"] = budget
        request.META["X-RateLimit-Cost-Remaining"] = max(0, budget - used)
        request.META["X-RateLimit-Cost-Reset"] = reset_time

        if not allowed:
            self._retry_after = max(1, reset_time - int(now))

        return allowed

    def wait(self):
        return self._retry_after


# Kept as a defensive fallback only, for the (practically unreachable -
# BaseAPIView.get_throttles only ever selects it when there is no
# X-Api-Key header at all, which combined with IsAuthenticated means the
# request would already have been rejected before throttling runs) branch
# where a request reaches throttling without an API key. Uses Django's
# cache backend (django-redis, see settings/common.py) directly rather
# than the sliding-window Lua path above, matching this class's pre-existing
# fixed-window behavior unchanged.
class ApiKeyRateThrottle(SimpleRateThrottle):
    scope = "api_key"
    rate = os.environ.get("API_KEY_RATE_LIMIT", "60/minute")

    def get_cache_key(self, request, view):
        api_key = request.headers.get("X-Api-Key")
        if not api_key:
            return None  # Allow the request if there's no API key
        return f"{self.scope}:{api_key}"

    def allow_request(self, request, view):
        allowed = super().allow_request(request, view)

        if allowed:
            now = self.timer()
            history = self.cache.get(self.key, [])
            while history and history[-1] <= now - self.duration:
                history.pop()
            num_requests = len(history)
            available = self.num_requests - num_requests
            reset_time = int(now + self.duration)

            request.META["X-RateLimit-Limit"] = self.num_requests
            request.META["X-RateLimit-Remaining"] = max(0, available)
            request.META["X-RateLimit-Reset"] = reset_time

        return allowed
