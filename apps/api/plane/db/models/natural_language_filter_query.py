# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models

# Module imports
from .workspace import WorkspaceBaseModel


class NaturalLanguageFilterQuery(WorkspaceBaseModel):
    """Audit/history record for one call to the rule-based natural-language
    filter assistant - see docs/feature-specs/04-views-filters.md
    ("Assistant de filtre en langage naturel") in plane-selfhost.

    Based on `WorkspaceBaseModel` (nullable `project`), not `ProjectBaseModel`
    (non-nullable `project`) as the spec's own text proposes - the spec was
    written before this fork's `IssueView` (same project-or-workspace-scoped
    duality) landed, and its data-model assumptions there are stale. See the
    feature's patch README for the full correction.

    `created_by` (from `BaseModel`/`AuditModel`) is the requesting user - no
    separate explicit user FK is needed.
    """

    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        PARTIAL = "partial", "Partial"
        FAILED = "failed", "Failed"

    raw_query = models.TextField()
    detected_language = models.CharField(max_length=8, blank=True)
    resolved_filters = models.JSONField(default=dict)
    restatement = models.TextField(blank=True)
    unresolved_terms = models.JSONField(default=list)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    latency_ms = models.IntegerField(null=True, blank=True)

    class Meta:
        verbose_name = "Natural Language Filter Query"
        verbose_name_plural = "Natural Language Filter Queries"
        db_table = "natural_language_filter_queries"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.raw_query[:50]} <{self.status}>"
