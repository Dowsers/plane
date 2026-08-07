# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from plane.db.models.base import BaseModel


class RateLimitTier(BaseModel):
    """
    Instance-wide rate-limit tier (no workspace FK - deliberate, matches
    the spec's own design: a single flat set of tiers configured once per
    instance via Instance Admin / God Mode, not per workspace). See
    docs/feature-specs/08-api-webhooks-cli.md ("2. Rate limiting plus
    genereux") in plane-selfhost.

    Only 3 tiers are seeded/actually resolved to in this fork: `session_web`,
    `personal_token`, `service_account` - the only caller types that exist
    in this Community edition today (see `APIToken.is_service` and the
    session-authenticated `plane.app` surface). The spec also proposes
    `oauth_app` and `mcp_server` tiers, but dedicated research confirmed
    neither a "Build a Plane App" OAuth platform nor an MCP server exists
    anywhere in this codebase to attach such a tier to - `key` is left as a
    free-form slug specifically so a future feature can add a new tier row
    without a schema change, but this feature does not seed or wire either
    of those two tiers.
    """

    key = models.SlugField(max_length=64, unique=True)
    requests_per_minute = models.PositiveIntegerField(default=60)
    requests_per_hour = models.PositiveIntegerField(default=1000)
    # Nullable/unused for now - populated only if a future complexity
    # scoring engine (spec's separate "Feature 1", a GraphQL-style query
    # cost system) is ever built. No such engine exists yet in this fork.
    complexity_points_per_hour = models.PositiveIntegerField(null=True, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Rate Limit Tier"
        verbose_name_plural = "Rate Limit Tiers"
        db_table = "rate_limit_tiers"
        ordering = ("key",)

    def __str__(self):
        return self.key
