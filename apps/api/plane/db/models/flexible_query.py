# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Flexible query layer - see docs/feature-specs/08-api-webhooks-cli.md
("Couche de requetes flexible facon GraphQL") in plane-selfhost.

The entity/relation whitelist itself is defined in code
(plane/utils/flexible_query/registry.py), not here - only the two
persistence concerns (per-workspace quota overrides + an audit log of every
attempt) live in this module.

DESIGN NOTE on the is_enabled/quota split: the spec's own suggested
`WorkspaceQuerySettings` model bundles a boolean `is_enabled` together with
the three numeric quota fields. This deliberately does NOT follow that
suggestion as-is: the established convention in this codebase for a simple
per-workspace on/off switch is a flat boolean field directly on `Workspace`
(see `is_initiatives_enabled`/`is_roadmap_enabled`/`is_flexible_query_enabled`
in workspace.py), not a satellite one-row-per-workspace table. Only the
numeric knobs - which have no flat-boolean precedent to follow - get this
dedicated model. A workspace with no row here simply uses the class
defaults (max_depth=3, max_cost=5000, timeout_ms=5000); the row only needs
to exist once an admin actually overrides something.
"""

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class WorkspaceQuerySettings(BaseModel):
    DEFAULT_MAX_DEPTH = 3
    DEFAULT_MAX_COST = 5000
    DEFAULT_TIMEOUT_MS = 5000

    workspace = models.OneToOneField(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="flexible_query_settings",
    )
    max_depth = models.PositiveIntegerField(default=DEFAULT_MAX_DEPTH)
    max_cost = models.PositiveIntegerField(default=DEFAULT_MAX_COST)
    timeout_ms = models.PositiveIntegerField(default=DEFAULT_TIMEOUT_MS)

    class Meta:
        verbose_name = "Workspace Query Settings"
        verbose_name_plural = "Workspace Query Settings"
        db_table = "workspace_query_settings"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.slug} query settings"


class FlexibleQueryLog(BaseModel):
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        REJECTED = "rejected", "Rejected"
        TIMEOUT = "timeout", "Timeout"
        PARTIAL = "partial", "Partial"

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="flexible_query_logs",
    )
    # Nullable: a "Build a Plane App" OAuth app token or a service token is
    # still attributed to *some* `User` row today (see APIToken.user in
    # db/models/api.py - every token, human or bot, has a non-null user),
    # but nullable here anyway per the spec's own data-model section, and as
    # a defensive measure so a `SET_NULL` on user deletion never blocks
    # deleting a user account.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="flexible_query_logs",
    )
    raw_query = models.JSONField(default=dict)
    computed_cost = models.PositiveIntegerField(default=0)
    duration_ms = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUCCESS)

    class Meta:
        verbose_name = "Flexible Query Log"
        verbose_name_plural = "Flexible Query Logs"
        db_table = "flexible_query_logs"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workspace", "created_at"], name="flex_query_log_ws_created_idx"),
        ]

    def __str__(self):
        return f"{self.workspace_id} {self.status} ({self.computed_cost})"
