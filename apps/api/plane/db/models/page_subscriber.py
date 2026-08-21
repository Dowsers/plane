# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), feature 5 - "Abonnements/notifications par page".
Calqued on `IssueSubscriber` (`plane.db.models.issue`) per the spec's own
wording, but - like `PageReaction`/`PageComment` before it in this same
category - does NOT inherit `ProjectBaseModel`/`WorkspaceBaseModel`: a
`Page` is not scoped to a single project (it can be linked to zero, one,
or several projects via the `ProjectPage` link table, or be a
workspace-level Wiki page with none at all - feature 4). Instead this
hand-writes a `workspace` FK, exactly like `Page`/`PageReaction`/
`PageComment` all already do, for the same reason each of their own module
docstrings gives.

`unique_together = ("page", "subscriber")` deliberately has no
`deleted_at` leg (unlike `PageReaction`'s partial-unique-index pattern):
this row is never soft- or hard-deleted by any endpoint this feature
exposes - `DELETE .../subscribe/` flips `unsubscribed_manually` on the
existing row in place instead of removing it (exigence 4's own
`unsubscribed_manually` flag needs a persistent row to carry that state on,
otherwise there would be nothing left to check the next time the same user
is mentioned again).
"""

from django.conf import settings
from django.db import models

from .base import BaseModel
from .page import Page


class PageSubscriber(BaseModel):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="page_subscribers")
    subscriber = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_subscriptions",
    )
    # Distinguishes an explicit "I clicked the bell icon" subscription
    # (exigence 1/2) or page-creation auto-subscribe (exigence 3) from an
    # auto-subscribe-by-mention one (exigence 4) - informational only, no
    # behavioural branch in this feature reads it back.
    subscribed_manually = models.BooleanField(default=True)
    # Blocks auto-resubscribe-by-mention after an explicit unsubscribe
    # (exigence 4) - see `plane.bgtasks.page_subscription_task.
    # _auto_subscribe_and_notify_mention`. Also what `DELETE .../subscribe/`
    # sets instead of deleting the row (see module docstring above).
    unsubscribed_manually = models.BooleanField(default=False)
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_page_subscribers",
    )

    class Meta:
        unique_together = ["page", "subscriber"]
        verbose_name = "Page Subscriber"
        verbose_name_plural = "Page Subscribers"
        db_table = "page_subscribers"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.page.name} {self.subscriber.email}"
