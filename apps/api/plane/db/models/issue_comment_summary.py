# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 4 - "Resume IA de fils de discussion" (AI thread
summary). Caches the latest LLM-generated summary of an issue's comment
thread, with numbered citations back to source `IssueComment`s.

Built on top of the shared per-workspace LLM foundation
(`plane.db.models.ai_config.WorkspaceAIConfig` /
`plane.utils.workspace_ai.get_workspace_llm_response`), NOT the spec's own
(superseded) `WorkspaceAIIntegration` model - see that module's docstring.

SECURITY SCOPE DECISION (already made, do not re-litigate): the spec's
exigence 5 wants `IssueComment.access == INTERNAL` comments to never be
visible, even indirectly, to a role without access. That access model does
not actually exist anywhere in the main app today -
`IssueCommentViewSet.get_queryset()` (plane/app/views/issue/comment.py) has
no filter on `access` at all, so any active `ProjectMember` (including
Guest) can already read INTERNAL comments in the normal thread. `access` is
only enforced on the anonymous public space-app surface
(`IssueCommentPublicViewSet`), which this feature does not touch. Decision:
this feature feeds ALL of an issue's (non-deleted) comments - INTERNAL and
EXTERNAL alike - into the summary prompt and citation set, exactly matching
what any project member can already read today. This is a deliberate
simplification, not an oversight.
"""

from django.conf import settings
from django.db import models

from .project import ProjectBaseModel


class IssueCommentSummaryStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"


class IssueCommentSummary(ProjectBaseModel):
    """One row per issue (OneToOne) - V1 keeps no history of past summaries,
    a regeneration simply overwrites this row (spec's own "Hors perimetre").
    """

    issue = models.OneToOneField("db.Issue", on_delete=models.CASCADE, related_name="ai_summary")
    summary_text = models.TextField(blank=True, default="")
    # List of {"marker": <int>, "comment_id": "<uuid str>", "snippet": "<str>"}.
    # A self-contained snapshot, not a live join - still renders fine (as
    # "Comment deleted" on the frontend) if the cited IssueComment is
    # soft-deleted after generation (exigence 11).
    citations = models.JSONField(default=list, blank=True)
    source_comment_count = models.PositiveIntegerField(default=0)
    # sha256 of the sorted (comment_id, updated_at) pairs of every non-deleted
    # comment on the issue at generation time - cheap staleness check
    # (exigence 6) without reloading full comment content.
    source_comments_hash = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=IssueCommentSummaryStatus.choices,
        default=IssueCommentSummaryStatus.PENDING,
    )
    # Server-side only (exigence 9) - never serialized back to the client.
    # The UI always shows a generic "couldn't generate, try again" message.
    error_message = models.TextField(null=True, blank=True)
    model_used = models.CharField(max_length=255, blank=True, default="")
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="issue_comment_summaries_generated",
    )
    generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Issue Comment Summary"
        verbose_name_plural = "Issue Comment Summaries"
        db_table = "issue_comment_summaries"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} <-> ai-summary:{self.status}"
