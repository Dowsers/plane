# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), feature 2 - "Reactions emoji sur les Pages". Mirrors
`IssueReaction`/`CommentReaction` (`plane.db.models.issue`) field-for-field
(same `TextField` for the emoji, same partial-unique-index pattern for
soft-delete-safe uniqueness), but does NOT inherit `ProjectBaseModel` or
`WorkspaceBaseModel` the way those two do/the spec suggested - a `Page` is
not scoped to a single project (it can be linked to zero, one, or several
projects via the `ProjectPage` link table, or be a workspace-level page with
none at all), so there is no single `project` to denormalize onto this
model. Instead this mirrors `Page` itself: plain `BaseModel` plus a
hand-written `workspace` FK, exactly like `Page`/`PageLog`/`PageLabel` do.

Scoped to project-level Page endpoints only for now (see
`plane.app.views.page.reaction.PageReactionViewSet`) - no workspace-level
Page CRUD endpoint exists yet in this fork to hang a workspace-level
reactions URL off of (every real Page URL today is nested under
`workspaces/<slug>/projects/<project_id>/pages/...`). That gap is closed by
a later feature in this category (Wiki GA). Once it ships, this same model/
serializer can be exposed at a second, thin `workspaces/<slug>/pages/
<page_id>/reactions/` URL without any model changes.
"""

from django.conf import settings
from django.db import models

from .base import BaseModel
from .page import Page


class PageReaction(BaseModel):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="page_reactions")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_reactions",
    )
    # Emoji stored as a unicode character, not a text shortcode - same
    # convention as IssueReaction.reaction/CommentReaction.reaction.
    reaction = models.TextField()
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_page_reactions",
    )

    class Meta:
        unique_together = ["page", "actor", "reaction", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["page", "actor", "reaction"],
                condition=models.Q(deleted_at__isnull=True),
                name="page_reaction_unique_page_actor_reaction_when_deleted_at_null",
            )
        ]
        verbose_name = "Page Reaction"
        verbose_name_plural = "Page Reactions"
        db_table = "page_reactions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.page.name} {self.actor.email}"
