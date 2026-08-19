# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 2 - "Detection de doublons/similarite". Generation,
recomputation, and explanation logic for
`plane.db.models.IssueDuplicateSuggestion`. See that model's own module
docstring for the `stale`-vs-dismiss-invalidation status design.

Built entirely on top of the shared embedding pipeline
(`plane.utils.issue_embedding.compute_or_refresh_issue_embedding`/
`generate_embedding_for_text`/`find_similar_issues`/`cosine_similarity`) -
no parallel embedding mechanism here (same convention as
`plane.utils.issue_triage_suggestion`, feature 1). Every public entry point
below is designed to NEVER raise on an expected failure mode (feature
disabled, embedding provider unavailable, no candidates) - matching this
codebase's established convention for every other category 9 generation
pipeline.

EXPLANATION GENERATION IS ALGORITHMIC, NOT A SECOND LLM CALL (exigence 4):
`build_duplicate_explanation` below finds the most semantically-close
excerpt pair via stdlib `difflib.SequenceMatcher` over sentence/paragraph
chunks, and highlights shared significant terms via plain tokenization +
stopword-filtered set intersection - zero embedding/LLM round-trips. Same
"deterministic/rule-based over a second model call when good-enough" spirit
as Category 4's NL filter assistant (regex/keyword + `difflib`).

READ-ACCESS SCOPING (exigence 8): every candidate-search entry point here
takes an explicit `accessible_project_ids` (or the `actor` it's derived
from) - never a blanket workspace/project query - so a project the acting/
requesting user isn't an active member of can never surface a candidate.
"""

import logging
import re
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Tuple

from django.utils import timezone

from plane.utils.exception_logger import log_exception
from plane.utils.issue_embedding import (
    compute_content_hash,
    compute_or_refresh_issue_embedding,
    cosine_similarity,
    find_similar_issues,
    generate_embedding_for_text,
)

logger = logging.getLogger(__name__)

# Exigence 3 - "au plus 5 candidats".
MAX_SUGGESTIONS = 5
# Deliberately small, cheap stopword list (English + French, since this
# fork's own content is bilingual) - "good enough", not a linguistically
# complete list; the goal is filtering noise words out of the highlighted
# shared-term list, not full NLP.
_STOPWORDS = frozenset(
    {
        "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
        "to", "of", "in", "on", "at", "for", "with", "by", "from", "as", "it", "this", "that",
        "these", "those", "not", "no", "do", "does", "did", "can", "could", "will", "would",
        "should", "has", "have", "had", "we", "you", "they", "he", "she", "i", "if", "then",
        "so", "than", "when", "what", "which", "who", "how", "there", "here",
        "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "est", "sont", "etait",
        "etre", "ete", "pour", "avec", "par", "dans", "sur", "au", "aux", "ce", "cet", "cette",
        "ces", "pas", "ne", "que", "qui", "quoi", "comment", "quand", "mais", "donc", "car",
        "son", "sa", "ses", "leur", "leurs", "nous", "vous", "ils", "elles",
    }
)
_TOKEN_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+")
# Sentence/paragraph splitter - blank lines or terminal punctuation.
_CHUNK_SPLIT_RE = re.compile(r"[\n\r]+|(?<=[.!?])\s+")
# Caps the O(n*m) excerpt-pairing scan below to stay cheap even against a
# pathologically long description.
_MAX_CHUNKS_PER_SIDE = 25


def _tokenize(text: Optional[str]) -> List[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text or "")]


def _significant_terms(text: Optional[str]) -> List[str]:
    return [t for t in _tokenize(text) if t not in _STOPWORDS and len(t) > 2]


def _split_chunks(text: Optional[str]) -> List[str]:
    if not text:
        return []
    chunks = [c.strip() for c in _CHUNK_SPLIT_RE.split(text) if c and c.strip()]
    return chunks[:_MAX_CHUNKS_PER_SIDE]


def _embeddable_text(name: Optional[str], description_stripped: Optional[str]) -> str:
    # Mirrors plane.utils.issue_embedding's own private `_embeddable_text`
    # join formula - kept as an independent copy rather than importing the
    # underscore-prefixed helper across modules, so this feature's own
    # text-shaping never silently drifts if that pipeline's join formula
    # changes for unrelated reasons.
    return f"{(name or '').strip()}\n\n{(description_stripped or '').strip()}".strip()


def find_best_matching_excerpt_pair(text_a: str, text_b: str) -> Tuple[str, str, float]:
    """Finds the (chunk_a, chunk_b) pair that is most semantically close
    across sentence/paragraph-level chunks of `text_a`/`text_b`. The PRIMARY
    selection signal is shared-significant-term overlap (Jaccard) - matching
    exigence 4's own wording ("les termes/n-grammes recouvrants") - with
    `difflib.SequenceMatcher` ratio as a secondary tie-breaker so a pair with
    zero lexical overlap still picks the character-closest chunk rather than
    an arbitrary first one. Falls back to the whole texts (truncated) if
    either side has no chunks. Returns `(excerpt_a, excerpt_b, ratio)`, where
    `ratio` is the difflib similarity of the WINNING pair (a display metric,
    not the selection criterion)."""
    chunks_a = _split_chunks(text_a) or ([text_a.strip()] if text_a and text_a.strip() else [])
    chunks_b = _split_chunks(text_b) or ([text_b.strip()] if text_b and text_b.strip() else [])

    if not chunks_a or not chunks_b:
        return (chunks_a[0] if chunks_a else ""), (chunks_b[0] if chunks_b else ""), 0.0

    best_score = -1.0
    best_a, best_b = chunks_a[0], chunks_b[0]
    for chunk_a in chunks_a:
        terms_a = set(_significant_terms(chunk_a))
        low_a = chunk_a.lower()
        for chunk_b in chunks_b:
            terms_b = set(_significant_terms(chunk_b))
            union = terms_a | terms_b
            jaccard = (len(terms_a & terms_b) / len(union)) if union else 0.0
            ratio = SequenceMatcher(None, low_a, chunk_b.lower()).ratio()
            # Jaccard term-overlap dominates the comparison (multiplied up
            # so it always outweighs the [0, 1] ratio); the ratio only
            # breaks ties within the same Jaccard "bucket".
            score = jaccard * 10 + ratio
            if score > best_score:
                best_score, best_a, best_b = score, chunk_a, chunk_b

    final_ratio = SequenceMatcher(None, best_a.lower(), best_b.lower()).ratio()
    return best_a, best_b, max(final_ratio, 0.0)


def build_duplicate_explanation(name_a, description_a, name_b, description_b) -> Dict:
    """Exigence 4's "why" - algorithmic only, see module docstring. Returns
    a plain JSON-serializable dict: closest-matching excerpt from each side,
    their difflib similarity ratio, and the shared significant terms
    (stopword-filtered, tokenized) between those two excerpts specifically
    (not the whole texts) - keeps the highlighted-term list tight and
    relevant to the excerpt actually shown."""
    text_a = _embeddable_text(name_a, description_a)
    text_b = _embeddable_text(name_b, description_b)

    excerpt_a, excerpt_b, ratio = find_best_matching_excerpt_pair(text_a, text_b)

    terms_a = set(_significant_terms(excerpt_a))
    terms_b = set(_significant_terms(excerpt_b))
    shared_terms = sorted(terms_a & terms_b)

    return {
        "excerpt_source": excerpt_a[:500],
        "excerpt_candidate": excerpt_b[:500],
        "excerpt_similarity": round(ratio, 4),
        "highlighted_terms": shared_terms[:25],
    }


# ---------------------------------------------------------------------------
# Feature enablement / scoping (exigence 8, 10)
# ---------------------------------------------------------------------------


def is_duplicate_detection_enabled_for_project(project, workspace=None) -> bool:
    """Same inheritance resolution shape as
    `plane.utils.issue_triage_suggestion.is_ai_triage_enabled_for_project` -
    the workspace master switch always wins first."""
    workspace = workspace or project.workspace
    if not workspace.is_duplicate_detection_enabled:
        return False
    if project.is_duplicate_detection_enabled is None:
        return True
    return bool(project.is_duplicate_detection_enabled)


def get_active_project_ids_for_user(user, workspace) -> set:
    """Exigence 8 - the set of project ids `user` currently has ACTIVE
    `ProjectMember` membership in, within `workspace`. `None`/anonymous user
    -> empty set (no candidates at all), never "everything"."""
    from plane.db.models import ProjectMember

    if user is None or getattr(user, "is_anonymous", False):
        return set()
    return set(
        ProjectMember.objects.filter(workspace_id=workspace.id, member_id=user.id, is_active=True).values_list(
            "project_id", flat=True
        )
    )


def get_duplicate_detection_scope_queryset(project, workspace, accessible_project_ids: Optional[set] = None):
    """Exigence 2/8 - `Issue.issue_objects` already excludes soft-deleted/
    archived/draft/triage-state issues (see `IssueManager.get_queryset`).
    Scoped to `project` alone unless `workspace.duplicate_detection_scope`
    is WORKSPACE. `accessible_project_ids`, when provided, additionally
    restricts to those projects regardless of scope - the caller-provided,
    real read-access boundary (exigence 8), never widened by this function.
    """
    from plane.db.models import DuplicateDetectionScope, Issue

    if workspace.duplicate_detection_scope == DuplicateDetectionScope.WORKSPACE:
        queryset = Issue.issue_objects.filter(workspace_id=workspace.id)
    else:
        queryset = Issue.issue_objects.filter(project_id=project.id)

    if accessible_project_ids is not None:
        queryset = queryset.filter(project_id__in=accessible_project_ids)

    return queryset


def _effective_threshold(workspace) -> float:
    return workspace.duplicate_detection_similarity_threshold


# ---------------------------------------------------------------------------
# Live "draft" check (exigence 1 - not yet a real Issue)
# ---------------------------------------------------------------------------


def check_draft_for_duplicates(project, workspace, title: str, description_stripped: Optional[str], user) -> List[Dict]:
    """`POST .../issues/duplicate-check/`'s core logic - computes an
    embedding for `title`/`description_stripped` ON THE FLY via
    `generate_embedding_for_text` directly (never
    `compute_or_refresh_issue_embedding`, which expects a real, persisted
    `Issue` - no `IssueEmbedding` row is ever created for a draft that
    doesn't exist yet). Returns up to `MAX_SUGGESTIONS` plain dicts (not
    model instances - there's no `IssueDuplicateSuggestion` row for a
    draft), or `[]` on any failure (feature disabled, embedding provider
    unavailable/erroring, nothing to embed) - exigence 12, never raises."""
    from plane.db.models import IssueEmbedding

    try:
        if not is_duplicate_detection_enabled_for_project(project, workspace=workspace):
            return []

        text = _embeddable_text(title, description_stripped)
        if not text:
            return []

        vector, _model_name, error = generate_embedding_for_text(workspace, text)
        if error or not vector:
            if error:
                logger.info("Skipping duplicate-check for a draft in project %s: %s", project.id, error)
            return []

        accessible_project_ids = get_active_project_ids_for_user(user, workspace)
        scope_queryset = get_duplicate_detection_scope_queryset(project, workspace, accessible_project_ids)
        candidate_ids = list(scope_queryset.values_list("id", flat=True))
        if not candidate_ids:
            return []

        threshold = _effective_threshold(workspace)
        candidate_embeddings = IssueEmbedding.objects.filter(issue_id__in=candidate_ids).select_related(
            "issue", "issue__state"
        )

        scored = []
        for candidate_embedding in candidate_embeddings:
            if candidate_embedding.embedding_dimension != len(vector):
                continue
            score = cosine_similarity(vector, candidate_embedding.embedding)
            if score >= threshold:
                scored.append((candidate_embedding.issue, score))

        scored.sort(key=lambda pair: pair[1], reverse=True)
        top = scored[:MAX_SUGGESTIONS]

        results = []
        for candidate, score in top:
            explanation = build_duplicate_explanation(
                title, description_stripped, candidate.name, candidate.description_stripped
            )
            results.append(
                {
                    "issue_id": str(candidate.id),
                    "project_id": str(candidate.project_id),
                    "name": candidate.name,
                    "state_id": str(candidate.state_id) if candidate.state_id else None,
                    "similarity_score": round(score, 4),
                    "explanation": explanation,
                }
            )
        return results
    except Exception as e:
        log_exception(e)
        return []


# ---------------------------------------------------------------------------
# Persisted suggestions for an existing issue (exigence 7)
# ---------------------------------------------------------------------------


def _apply_similarity_results(issue, similar: List[Tuple[object, float]], issue_content_hash: str) -> List:
    """Upserts `IssueDuplicateSuggestion` rows for `issue` against
    `similar` (a fresh `find_similar_issues` result), then ages out any
    previously `pending`/`stale` row for `issue` that didn't re-qualify this
    round. See `IssueDuplicateSuggestion`'s own module docstring for the
    full `stale`-vs-dismiss-invalidation design this implements."""
    from plane.db.models import IssueDuplicateSuggestion, IssueDuplicateSuggestionStatus, IssueEmbedding

    if not similar:
        # Nothing qualifies any more - age out every previously live row.
        IssueDuplicateSuggestion.objects.filter(
            issue=issue,
            status__in=[IssueDuplicateSuggestionStatus.PENDING, IssueDuplicateSuggestionStatus.STALE],
        ).update(status=IssueDuplicateSuggestionStatus.STALE, updated_at=timezone.now())
        return []

    candidate_ids = [candidate.id for candidate, _score in similar]
    candidate_hash_by_id = dict(
        IssueEmbedding.objects.filter(issue_id__in=candidate_ids).values_list("issue_id", "content_hash")
    )
    existing_rows = {
        row.suggested_issue_id: row
        for row in IssueDuplicateSuggestion.objects.filter(issue=issue, suggested_issue_id__in=candidate_ids)
    }

    matched_ids = set()
    results = []

    for candidate, score in similar:
        matched_ids.add(candidate.id)
        candidate_hash = candidate_hash_by_id.get(candidate.id, "")
        existing = existing_rows.get(candidate.id)

        if existing is None:
            explanation = build_duplicate_explanation(
                issue.name, issue.description_stripped, candidate.name, candidate.description_stripped
            )
            row = IssueDuplicateSuggestion.objects.create(
                issue=issue,
                suggested_issue=candidate,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                similarity_score=score,
                status=IssueDuplicateSuggestionStatus.PENDING,
                explanation=explanation,
                issue_content_hash=issue_content_hash,
                suggested_issue_content_hash=candidate_hash,
            )
            results.append(row)
            continue

        if existing.status in (
            IssueDuplicateSuggestionStatus.CONFIRMED_DUPLICATE,
            IssueDuplicateSuggestionStatus.CONFIRMED_RELATED,
        ):
            # Terminal - a human already resolved this pair, never touched
            # again by detection.
            continue

        if existing.status == IssueDuplicateSuggestionStatus.DISMISSED:
            content_changed = (
                existing.issue_content_hash != issue_content_hash
                or existing.suggested_issue_content_hash != candidate_hash
            )
            if not content_changed:
                # Exigence 6 - leave a still-accurate dismiss alone.
                continue
            # Exigence 6 - content changed materially since the dismiss:
            # resurrect the SAME row back to pending with a fresh score.
            existing.resolved_by = None
            existing.resolved_at = None
        # (pending or stale, or a just-resurrected dismiss) - refresh in place.
        explanation = build_duplicate_explanation(
            issue.name, issue.description_stripped, candidate.name, candidate.description_stripped
        )
        existing.status = IssueDuplicateSuggestionStatus.PENDING
        existing.similarity_score = score
        existing.explanation = explanation
        existing.issue_content_hash = issue_content_hash
        existing.suggested_issue_content_hash = candidate_hash
        existing.save(
            update_fields=[
                "status",
                "similarity_score",
                "explanation",
                "issue_content_hash",
                "suggested_issue_content_hash",
                "resolved_by",
                "resolved_at",
                "updated_at",
            ]
        )
        results.append(existing)

    # Age out any previously live (pending/stale) row not re-confirmed above.
    IssueDuplicateSuggestion.objects.filter(
        issue=issue,
        status__in=[IssueDuplicateSuggestionStatus.PENDING, IssueDuplicateSuggestionStatus.STALE],
    ).exclude(suggested_issue_id__in=matched_ids).update(
        status=IssueDuplicateSuggestionStatus.STALE, updated_at=timezone.now()
    )

    return results


def _reevaluate_reverse_dismissed_rows(issue, new_content_hash: str) -> List:
    """Exigence 6, reverse direction: `issue` may be the *candidate*
    (`suggested_issue`) of a `dismissed` row whose own "source" ticket
    hasn't changed. Re-evaluates those rows using the two issues' already-
    stored embeddings (no fresh provider call - both embeddings already
    exist by construction, since a suggestion row can't exist without both
    sides having been embedded at some point)."""
    from plane.db.models import IssueDuplicateSuggestion, IssueDuplicateSuggestionStatus, IssueEmbedding

    dismissed_rows = list(
        IssueDuplicateSuggestion.objects.filter(
            suggested_issue=issue, status=IssueDuplicateSuggestionStatus.DISMISSED
        )
        .exclude(suggested_issue_content_hash=new_content_hash)
        .select_related("issue")
    )
    if not dismissed_rows:
        return []

    this_embedding = IssueEmbedding.objects.filter(issue_id=issue.id).first()
    if this_embedding is None:
        return []

    other_ids = [row.issue_id for row in dismissed_rows]
    other_embeddings = {e.issue_id: e for e in IssueEmbedding.objects.filter(issue_id__in=other_ids)}

    updated = []
    for row in dismissed_rows:
        other_embedding = other_embeddings.get(row.issue_id)
        if other_embedding is None or other_embedding.embedding_dimension != this_embedding.embedding_dimension:
            continue

        score = cosine_similarity(other_embedding.embedding, this_embedding.embedding)
        explanation = build_duplicate_explanation(
            row.issue.name, row.issue.description_stripped, issue.name, issue.description_stripped
        )
        row.status = IssueDuplicateSuggestionStatus.PENDING
        row.similarity_score = score
        row.explanation = explanation
        row.suggested_issue_content_hash = new_content_hash
        row.issue_content_hash = other_embedding.content_hash
        row.resolved_by = None
        row.resolved_at = None
        row.save(
            update_fields=[
                "status",
                "similarity_score",
                "explanation",
                "issue_content_hash",
                "suggested_issue_content_hash",
                "resolved_by",
                "resolved_at",
                "updated_at",
            ]
        )
        updated.append(row)

    return updated


def confirm_duplicate_suggestion(suggestion, relation_type: str, actor):
    """Exigence 5 - 'Marquer comme doublon'/'Marquer comme lie'. Creates a
    single `IssueRelation` and, for `relation_type == "duplicate"`, fires
    the EXACT SAME `duplicate_issue_data_migration_task.delay(...)` call
    `IssueRelationViewSet.create()` (category 1,
    `plane.app.views.issue.relation`) already fires for every "duplicate"
    relation it creates - see that view's own docstring for the FK-direction
    convention this relies on: `issue` (the "loser", the ticket being
    marked a duplicate) is this suggestion's own `issue`, `related_issue`
    (the "survivor", the chosen original) is its `suggested_issue`. That
    ordering matches the confirm endpoint's own semantics exactly (the
    ticket you're looking at is being marked a duplicate OF the older
    candidate).

    Deliberately does NOT call `IssueRelationViewSet.create()` directly -
    that method reads `self.request`, which only exists after DRF's
    `.dispatch()` binds it; calling it out-of-band from a different view
    would require faking that plumbing. Replicated here instead (the
    fallback this feature's own build instructions explicitly allow),
    single-relation, get-or-create idempotent (matching the existing view's
    own `ignore_conflicts=True` idempotency on repeat calls) rather than the
    existing view's bulk-multi-issue shape, which this single-suggestion
    confirm action has no need for.

    Deliberately does NOT dispatch any webhook - out of scope for this
    feature by explicit decision (see this module's own feature docstring
    reference to docs/feature-specs/09-ai-features.md's webhooks section).
    """
    from plane.bgtasks.duplicate_issue_data_migration_task import duplicate_issue_data_migration_task
    from plane.db.models import IssueRelation

    relation = IssueRelation.objects.filter(
        issue_id=suggestion.issue_id,
        related_issue_id=suggestion.suggested_issue_id,
        deleted_at__isnull=True,
    ).first()
    if relation is None:
        relation = IssueRelation.objects.create(
            issue_id=suggestion.issue_id,
            related_issue_id=suggestion.suggested_issue_id,
            relation_type=relation_type,
            project_id=suggestion.project_id,
            workspace_id=suggestion.workspace_id,
            created_by=actor,
            updated_by=actor,
        )

    if relation_type == "duplicate":
        duplicate_issue_data_migration_task.delay(relation_id=str(relation.id), actor_id=str(actor.id))

    return relation


def process_issue_for_duplicate_detection(issue, actor=None) -> List:
    """Single entry point called BOTH unconditionally right after issue
    creation AND after a material title/description edit to an existing
    issue (exigence 7 - "ne s'execute pas seulement a la creation") - same
    "always fired, self-gates on enablement" convention as
    `plane.utils.issue_triage_suggestion.generate_issue_triage_suggestion`.
    Never raises - every expected failure path (disabled, no real content
    change, embedding provider unavailable) returns `[]` silently
    (exigence 12).

    `actor` (the user who created/edited the issue) drives exigence 8's
    read-access scoping for the CANDIDATE search - `None` (e.g. a
    system-triggered recompute with no human actor) degrades to "no
    candidates" rather than an unscoped query.
    """
    from plane.db.models import IssueEmbedding

    try:
        workspace = issue.workspace
        project = issue.project

        if not is_duplicate_detection_enabled_for_project(project, workspace=workspace):
            return []

        new_hash = compute_content_hash(issue.name, issue.description_stripped)
        existing_embedding = IssueEmbedding.objects.filter(issue_id=issue.id).first()

        if existing_embedding is not None and existing_embedding.content_hash == new_hash:
            # No real content change since we last processed this issue -
            # nothing to (re)compute. Exigence 7 only fires on a MATERIAL
            # change.
            return []

        embedding = compute_or_refresh_issue_embedding(issue)

        # Exigence 6, reverse direction - pure hash comparison + reuse of
        # already-stored embeddings, attempted regardless of whether THIS
        # issue's own embedding call above succeeded.
        _reevaluate_reverse_dismissed_rows(issue, new_hash)

        if embedding is None:
            # Exigence 12 - embedding provider unavailable/erroring. Never
            # blocks the caller; existing suggestions are left untouched
            # rather than speculatively rewritten with stale data.
            return []

        accessible_project_ids = get_active_project_ids_for_user(actor, workspace) if actor is not None else set()
        scope_queryset = get_duplicate_detection_scope_queryset(project, workspace, accessible_project_ids)
        threshold = _effective_threshold(workspace)

        similar = find_similar_issues(issue, scope_queryset=scope_queryset, top_n=MAX_SUGGESTIONS, min_score=threshold)

        return _apply_similarity_results(issue, similar, embedding.content_hash)
    except Exception as e:
        log_exception(e)
        return []
