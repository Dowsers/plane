# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), feature 4 - "Wiki workspace en GA". A `PageCollection`
is a folder used to organize workspace-level Wiki pages (`Page.is_global =
True`) into a nested tree, independent of a page's own `parent`
self-referencing sub-page hierarchy.

Hand-writes its own `workspace` FK rather than inheriting
`WorkspaceBaseModel` - same reasoning already established by `Page`/
`PageLog`/`PageLabel`/`PageReaction` (see that model's own docstring):
`WorkspaceBaseModel` auto-adds a singular nullable `project` FK synced via
a save() override, which has no meaning here - a Collection is a pure
workspace-level concept with no project scoping at all (unlike a `Page`,
which at least *can* be linked to projects via `ProjectPage`).

Max nesting depth (3 levels, exigence 3) is enforced at the
serializer/view layer (`plane.app.views.page.workspace`), not via a DB
constraint - see that module for the depth-computation helpers.
"""

from django.db import models

from .base import BaseModel


class PageCollection(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_collections")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    name = models.CharField(max_length=255)
    logo_props = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Page Collection"
        verbose_name_plural = "Page Collections"
        db_table = "page_collections"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workspace", "parent"], name="pgcoll_wksp_parent_idx"),
        ]

    def __str__(self):
        return f"{self.workspace.slug} <{self.name}>"
