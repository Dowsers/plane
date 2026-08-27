# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 14, feature 14c (docs/feature-specs/14-pricing-gap-remediation.md
in plane-selfhost, "Page Templates") - reusable blueprint for creating new
Pages, the direct equivalent of `ProjectTemplate`
(`plane.db.models.project_template`) for Pages. Plain `BaseModel` + explicit
`workspace` FK (not `WorkspaceBaseModel`), same reasoning as
`ProjectTemplate`: a `PageTemplate` does not itself belong to a project or
teamspace - the destination scope (project, teamspace, workspace Wiki) is
chosen at instantiation time (see `plane.utils.page_template`), not fixed on
the template itself.

`description_html`/`description_json`/`description_stripped` mirror `Page`'s
own fields and `save()` pattern exactly (`plane.db.models.page.Page.save`),
including the same "empty html means None stripped" edge case. No
`description_binary` - a template has no real-time collaborative editing
(see spec, "Hors perimetre").
"""

from django.db import models
from django.db.models.functions import Lower

from plane.utils.html_processor import strip_tags

from .base import BaseModel


class PageTemplate(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_templates")
    name = models.CharField(max_length=255)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_json = models.JSONField(default=dict, blank=True)
    description_stripped = models.TextField(blank=True, null=True)
    logo_props = models.JSONField(default=dict)
    usage_count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Page Template"
        verbose_name_plural = "Page Templates"
        db_table = "page_templates"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "workspace",
                condition=models.Q(deleted_at__isnull=True),
                name="page_template_unique_name_ci_per_workspace",
            )
        ]
        indexes = [models.Index(fields=["workspace"], name="page_template_workspace_idx")]

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"

    def save(self, *args, **kwargs):
        # Strip the html tags using html parser - same pattern as
        # Page.save()/PageVersion.save().
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super(PageTemplate, self).save(*args, **kwargs)
