# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), features 1+3 (merged) - "Commentaires ancres sur les
Pages" + "Resolution de fils de commentaires". Pre-implementation research
confirmed these two spec sections describe the same underlying system (same
`PageComment`/`PageCommentReaction` model shape, same resolution mechanics),
diverging only on anchor granularity - feature 1's real Tiptap Mark anchor
(`anchor_id`, shared with the `data-comment-id` attribute of the inline
Mark serialized into `Page.description_html`) wins over feature 3's coarser
`anchor_block_id`, per this feature's own build decisions.

Mirrors `IssueComment`/`CommentReaction` (`plane.db.models.issue`)
field-for-field where the shape matches, but - like `PageReaction`
(`plane.db.models.page_reaction`, category 10 feature 2) before it - does
NOT inherit `WorkspaceBaseModel`/`ProjectBaseModel`: a `Page` is not scoped
to a single project (it can be linked to zero, one or several projects via
the `ProjectPage` link table, or be a workspace-level Wiki page with none
at all - category 10 feature 4). Instead this hand-writes a `workspace` FK,
exactly like `Page`/`PageReaction` do.

No `Description` one-to-one sync (unlike `IssueComment`): decision #9 of
this feature's build brief - Page content itself isn't full-text
searchable in this fork today, so there is no full-text index for comments
to be consistent with, and nothing to sync into.

No `access` field (`CommentAccessEnum`): decision #8 - that enum doesn't
exist as a real type anywhere in this codebase, and `IssueComment.access`
(the closest precedent) is unenforced in the main app. Omitted rather than
adding a cosmetic, unused field.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from plane.utils.html_processor import strip_tags

from .base import BaseModel
from .page import Page


class PageComment(BaseModel):
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="comments")
    # NULL for the root of a thread, set for a reply. Replies inherit the
    # root's anchor (feature 1 exigence 3 / feature 3 exigence 2) rather
    # than carrying their own - see the anchor_id invariant enforced in
    # save() below.
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="replies")
    # Shared with the `data-comment-id` attribute of the Tiptap
    # `InlineComment` Mark (packages/editor - a separate, later frontend
    # task) once it lands. Required on a root comment, forbidden on a
    # reply - validated in save() below (Python-level, not a DB
    # constraint, so this stays compatible with any pre-existing rows -
    # this feature's own decision #3).
    anchor_id = models.UUIDField(null=True, blank=True)
    # Last known snapshot of the anchored text, pushed by the client at
    # creation time (and whenever it re-resolves the anchor's position),
    # for fallback display once the anchor is orphaned - see
    # `is_orphaned` below.
    anchor_text = models.TextField(null=True, blank=True)
    # True once the anchor Mark no longer appears anywhere in this Page's
    # `description_html`. Flipped both ways (an orphaned anchor can come
    # back via undo) by
    # `plane.utils.page_comment.reconcile_page_comment_anchors`, called
    # from `plane.bgtasks.page_transaction_task.page_transaction` on every
    # description save - see that task's module docstring for why that is
    # the right choke point for this.
    is_orphaned = models.BooleanField(default=False)
    # Same three fields as IssueComment, for rendering consistency.
    comment_stripped = models.TextField(verbose_name="Comment", blank=True)
    comment_json = models.JSONField(blank=True, default=dict)
    comment_html = models.TextField(blank=True, default="<p></p>")
    is_resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="page_comments_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_comments",
    )
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_page_comments")

    class Meta:
        verbose_name = "Page Comment"
        verbose_name_plural = "Page Comments"
        db_table = "page_comments"
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.page.name} {self.actor.email}"

    def save(self, *args, **kwargs):
        # anchor_id required on a root comment, forbidden on a reply. In
        # normal request flow this never actually fires - both view create
        # paths (root create vs. the dedicated `replies` action) always
        # construct a correctly-shaped instance already - this only guards
        # against a future direct-ORM misuse (a management command, a data
        # migration, ...). `BaseViewSet.handle_exception`
        # (plane.app.views.base) already converts a
        # `django.core.exceptions.ValidationError` into an HTTP 400, so
        # this is still safe to reach from a view by accident.
        if self.parent_id is None and not self.anchor_id:
            raise ValidationError("A root Page comment thread requires an anchor_id.")
        if self.parent_id is not None and self.anchor_id:
            raise ValidationError("A reply must not carry its own anchor_id - it inherits the thread root's.")

        self.comment_stripped = strip_tags(self.comment_html) if self.comment_html else ""
        super().save(*args, **kwargs)


class PageCommentReaction(BaseModel):
    """Mirrors `PageReaction`/`CommentReaction` field-for-field (same
    `TextField` emoji, same partial-unique-index soft-delete-safe
    uniqueness pattern), scoped to `PageComment` instead of `Page`/`Issue`.
    """

    comment = models.ForeignKey(PageComment, on_delete=models.CASCADE, related_name="reactions")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_comment_reactions",
    )
    reaction = models.TextField()
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="workspace_page_comment_reactions"
    )

    class Meta:
        unique_together = ["comment", "actor", "reaction", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["comment", "actor", "reaction"],
                condition=models.Q(deleted_at__isnull=True),
                name="page_comment_reaction_unique_comment_actor_reaction_when_deleted_at_null",
            )
        ]
        verbose_name = "Page Comment Reaction"
        verbose_name_plural = "Page Comment Reactions"
        db_table = "page_comment_reactions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.comment.page.name} {self.actor.email}"
