# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), feature 5 - "Abonnements/notifications par page".
Genuinely new: no `IssueActivity`-equivalent existed for `Page` before this
feature (feature 4, "Wiki workspace en GA", explicitly deferred its own
exigence 12 - a collection-move/conversion activity trail - in
anticipation of this model). Calqued on `IssueActivity`
(`plane.db.models.issue`) field-for-field where the shape matches, but -
like `PageReaction`/`PageComment`/`PageSubscriber` before it in this same
category - hand-writes a `workspace` FK rather than inheriting
`ProjectBaseModel`, for the same "a Page isn't scoped to one project"
reason each of their own module docstrings gives.

Deliberately generic on `verb` (a plain `CharField`, no `choices=`) so a
future small patch can add Wiki-GA-flavoured verbs (e.g. "moved",
"converted") without a schema change, per this feature's own build brief -
this feature only ever writes `updated` (debounced content edit),
`renamed`, `locked`, `unlocked`, `archived`, `unarchived`, `access_changed`,
`mentioned`, and `commented`, all created from
`plane.bgtasks.page_subscription_task`.
"""

from django.conf import settings
from django.db import models

from .base import BaseModel
from .page import Page


class PageActivity(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="page_activities",
    )
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="page_activities",
    )
    verb = models.CharField(max_length=255, verbose_name="Action", default="updated")
    field = models.CharField(max_length=255, verbose_name="Field Name", blank=True, null=True)
    old_value = models.TextField(verbose_name="Old Value", blank=True, null=True)
    new_value = models.TextField(verbose_name="New Value", blank=True, null=True)
    epoch = models.FloatField(null=True, blank=True)

    class Meta:
        verbose_name = "Page Activity"
        verbose_name_plural = "Page Activities"
        db_table = "page_activities"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["page", "-created_at"], name="page_activity_page_created_idx"),
        ]

    def __str__(self):
        return f"{self.page.name} {self.verb}"
