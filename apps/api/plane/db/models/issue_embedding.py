# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared issue-embedding storage - a category 9 (AI features,
docs/feature-specs/09-ai-features.md in plane-selfhost) INFRASTRUCTURE
PREREQUISITE for feature 1 (AI-assisted auto-triage) and feature 2
(duplicate/similarity detection). See `plane.utils.issue_embedding` for the
generation/search logic that reads and writes this model, and
`plane.bgtasks.issue_embedding_task` for the Celery wiring.

WHY PURE PYTHON, NOT pgvector: pgvector's extension control file is
confirmed absent from this fork's postgres:15.7-alpine image (`CREATE
EXTENSION vector` fails directly against the real running container, no
control file for the extension exists on this build) - decision already
made: store the embedding as a plain JSONField (a list of floats) and
compute cosine similarity in Python/numpy at query time over an
already-scoped (project/workspace) queryset. Confirmed viable at this
instance's real scale (~2,300 issues total across 87 projects, largest
single project ~550 issues) - brute-force comparison against a few hundred
rows is fast enough, no approximate-nearest-neighbor index needed.

WHY `model_name`/`embedding_dimension` ARE STORED EXPLICITLY: different
embedding models produce vectors of different lengths in unrelated vector
spaces - a workspace that reconfigures its `WorkspaceAIConfig` to a
different provider/model must never have its old embeddings silently (and
meaninglessly) compared against new ones. `model_name` is provider-prefixed
(e.g. "openai/text-embedding-3-small") so switching providers is also
visible even if a model name were ever reused across providers.
`embedding_dimension` is stored redundantly (rather than just
`len(embedding)`) so a caller can filter/guard on dimension without
deserializing the JSON vector itself.

ONE ROW PER ISSUE, NO HISTORY: same convention as `IssueCommentSummary` - a
regeneration overwrites this row rather than keeping past embeddings.
"""

from django.db import models

from .project import ProjectBaseModel


class IssueEmbedding(ProjectBaseModel):
    """`workspace`/`project` come from `ProjectBaseModel` - denormalized FKs
    for fast scope filtering, matching this fork's convention on similar
    per-issue derived-data models (e.g. `IssueVersion`, `IssueCommentSummary`).
    """

    issue = models.OneToOneField("db.Issue", on_delete=models.CASCADE, related_name="embedding")
    # A list of floats - see module docstring for why this is a JSONField
    # and not a pgvector column.
    embedding = models.JSONField(default=list, blank=True)
    # sha256 of the issue's `name` + stripped `description` at the time this
    # embedding was generated - lets `compute_or_refresh_issue_embedding`
    # skip a redundant, costly external-API call when the issue's text
    # hasn't actually changed since the last computation.
    content_hash = models.CharField(max_length=64, blank=True, default="")
    # Provider-prefixed, e.g. "openai/text-embedding-3-small" - see module
    # docstring re: why the provider prefix matters.
    model_name = models.CharField(max_length=255, blank=True, default="")
    embedding_dimension = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Issue Embedding"
        verbose_name_plural = "Issue Embeddings"
        db_table = "issue_embeddings"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} <-> embedding:{self.model_name}"
