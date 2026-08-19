# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 2 - "Detection de doublons/similarite". Stores a
single directional candidate pairing (`issue` is the "source" ticket,
`suggested_issue` the candidate) produced by
`plane.utils.issue_duplicate_detection`, built entirely on top of the
shared embedding pipeline (`plane.utils.issue_embedding`,
`plane.db.models.issue_embedding.IssueEmbedding` - see that model's own
docstring for why similarity is plain Python/numpy cosine similarity rather
than pgvector) - no parallel embedding mechanism here.

UNIQUE CONSTRAINT ON (issue, suggested_issue) - exigence 6's own "contrainte
unique... pour garantir la persistance du dismiss": a re-detected pair never
creates a second row, it updates the existing one in place. Directional, not
symmetric - if issue A is later found similar to issue B independently of an
earlier (B, A) suggestion, both rows can legitimately coexist (they surface
on two different tickets' own "Doublons suggeres" lists, matching the
per-ticket-scoped GET .../issues/<issue_id>/duplicate-suggestions/ endpoint
the spec itself defines).

STATUS DESIGN - `stale` VS THE DISMISS-INVALIDATION MECHANISM (exigence 6):
these are deliberately two DIFFERENT mechanisms, not the same one under two
names:
  - Dismiss-invalidation (exigence 6, literal): applies ONLY to a `dismissed`
    row. A later detection run re-encountering the same pair among its fresh
    top-N results compares the CURRENT content hash of both issues against
    the hashes snapshotted on the row (`issue_content_hash`/
    `suggested_issue_content_hash`, below) at the time it was last evaluated.
    If either changed, the human's earlier dismissal was made against
    content that no longer exists - the row flips back to `pending` with a
    fresh score/explanation (same row, respecting the unique constraint,
    `resolved_by`/`resolved_at` cleared). If neither changed, the dismissal
    is left untouched, exactly as exigence 6 demands ("la meme paire ne doit
    plus etre re-suggeree").
  - `stale` (spec's own words: "ce dernier statut quand le contenu source
    change apres suggestion") applies ONLY to a row that was `pending` (i.e.
    NOT YET resolved by a human either way) when a fresh detection run
    completes and no longer finds that candidate among the qualifying
    results for `issue` (score dropped below threshold, the candidate fell
    out of scope, or it simply wasn't re-examined this round). This is a
    SYSTEM-driven "this suggestion aged out", distinct from a human's
    `dismissed` decision - useful for the UI to distinguish "a person looked
    at this and passed" from "circumstances changed before anyone looked at
    it". A `stale` row is excluded from the default pending list, and (like
    `pending`) it is a candidate the NEXT detection run may bring back to
    `pending` if the pair re-qualifies again.
  Both mechanisms reuse the same two content-hash snapshot fields - see
  `plane.utils.issue_duplicate_detection._apply_similarity_results` for the
  exact update logic implementing this split.

`explanation` IS ALGORITHMIC, NOT A SECOND LLM CALL (exigence 4, and this
fork's own precedent for preferring deterministic explanations - see
`plane.utils.issue_duplicate_detection.build_duplicate_explanation`): the
closest-matching excerpt pair and the shared significant-term list are
computed via stdlib `difflib`/tokenization over the two issues' own
title+description text, not a second round-trip to an embedding/LLM
provider. Stored here (rather than recomputed on every read) so the
"why" UI never needs a recompute.

`issue_content_hash`/`suggested_issue_content_hash`: snapshot of
`IssueEmbedding.content_hash` (or the equivalent draft-text hash) for each
side of the pair AT THE TIME this row's score/explanation were last
(re)computed - the sole input to both status mechanisms described above.
"""

from django.conf import settings
from django.db import models

from .project import ProjectBaseModel


class IssueDuplicateSuggestionStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    DISMISSED = "dismissed", "Dismissed"
    CONFIRMED_DUPLICATE = "confirmed_duplicate", "Confirmed Duplicate"
    CONFIRMED_RELATED = "confirmed_related", "Confirmed Related"
    # See module docstring - system-driven aging-out of a `pending` row,
    # distinct from a human `dismissed` decision.
    STALE = "stale", "Stale"


class IssueDuplicateSuggestion(ProjectBaseModel):
    """`workspace`/`project` come from `ProjectBaseModel` - denormalized FKs
    for fast scope filtering, matching `IssueEmbedding`/`IssueTriageSuggestion`.
    Unlike those two, this is NOT one-row-per-issue - an issue can have up to
    5 live candidate suggestions at once (exigence 3), hence a plain FK
    (`related_name="duplicate_suggestions"`) rather than a OneToOne.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="duplicate_suggestions")
    suggested_issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, related_name="duplicate_suggested_by"
    )
    similarity_score = models.FloatField(default=0.0)
    status = models.CharField(
        max_length=30,
        choices=IssueDuplicateSuggestionStatus.choices,
        default=IssueDuplicateSuggestionStatus.PENDING,
    )
    # {"excerpt_source": str, "excerpt_candidate": str, "excerpt_similarity":
    # float, "highlighted_terms": [str, ...]} - see
    # plane.utils.issue_duplicate_detection.build_duplicate_explanation.
    explanation = models.JSONField(default=dict, blank=True)

    # See module docstring - inputs to both the dismiss-invalidation and
    # `stale` mechanisms.
    issue_content_hash = models.CharField(max_length=64, blank=True, default="")
    suggested_issue_content_hash = models.CharField(max_length=64, blank=True, default="")

    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issue_duplicate_suggestions_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Issue Duplicate Suggestion"
        verbose_name_plural = "Issue Duplicate Suggestions"
        db_table = "issue_duplicate_suggestions"
        ordering = ("-similarity_score",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "suggested_issue"],
                name="issue_duplicate_suggestion_unique_pair",
            )
        ]
        indexes = [
            models.Index(fields=["issue", "status"], name="issue_dup_sugg_iss_st_idx"),
            models.Index(fields=["suggested_issue", "status"], name="issue_dup_sugg_cand_st_idx"),
        ]

    def __str__(self):
        return f"{self.issue_id} ~ {self.suggested_issue_id} ({self.status}, {self.similarity_score:.2f})"
