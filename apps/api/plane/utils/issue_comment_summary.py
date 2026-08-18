# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Generation logic for category 9 (AI features,
docs/feature-specs/09-ai-features.md in plane-selfhost) feature 4 - "Resume
IA de fils de discussion" (AI thread summary). See
`plane.db.models.issue_comment_summary` for the model/scope-decision
rationale (in particular: no INTERNAL-vs-role comment filtering - every
non-deleted comment is eligible for the prompt and citations).

CITATION APPROACH: rather than asking the LLM for free-form prose with
`[1]`/`[2]` markers and then trying to parse those markers out of text
(fragile - the model can format them inconsistently), every prompt asks the
LLM to respond with a single structured JSON object:

    {"summary": "... [1] ... [2] ...", "citations": [{"marker": 1,
    "comment_id": "<uuid>"}, ...]}

`get_workspace_llm_response` only returns plain text (no JSON-mode/function
calling), so the response is parsed with `_parse_llm_json` (tolerant of a
```json fenced code block, since some providers wrap JSON in markdown even
when asked not to). Every citation's `comment_id` is then validated against
the real set of comment ids that were actually placed in that prompt -
citations referencing an id we never showed the model are dropped rather
than trusted. This guarantees, by construction rather than by asking the
model nicely, that a citation always resolves to a real `IssueComment` (or
to nothing, if that comment was later soft-deleted - see exigence 11).

CHUNKING (exigence 10): a simple 2-level hierarchy, not a general streaming
map-reduce. If the thread has more than `CHUNK_THRESHOLD` comments, they are
split chronologically into fixed-size chunks; each chunk is summarized
independently (stage 1, same structured-JSON-with-real-comment-ids approach
as the single-pass case), then a final call synthesizes the chunk summaries
into one overall summary (stage 2). The stage-2 prompt gives the model only
the *chunk summaries' text* plus the pool of citation candidates
(comment_id + snippet) already validated in stage 1 - it is explicitly told
to only cite ids from that pool, and the final result is validated AGAIN
against the full original comment-id set before saving, so a final citation
can never end up pointing at a synthetic "chunk" identity, only ever at a
real `IssueComment`.
"""

import hashlib
import json
import re
from typing import Iterable, List, Optional, Tuple

from django.utils import timezone

from plane.utils.exception_logger import log_exception
from plane.utils.workspace_ai import get_workspace_ai_config, get_workspace_llm_response

# Exigence 1 - minimum number of comments an issue needs before the "AI
# Summary" button/POST is even allowed. Deliberately hardcoded rather than a
# new settings field - it's a single, rarely-tuned number.
MIN_COMMENTS_FOR_SUMMARY = 3

# Exigence 3 - target sentence-count range communicated to the model. Not
# enforced server-side (we don't run a sentence-count check on the
# response) - a soft prompt instruction is sufficient for a v1.
MIN_SUMMARY_SENTENCES = 3
MAX_SUMMARY_SENTENCES = 8

# Exigence 10 - simple 2-level hierarchical chunking thresholds. Comment
# counts above CHUNK_THRESHOLD get split into CHUNK_SIZE-sized chronological
# chunks instead of a single pass over the whole thread.
CHUNK_THRESHOLD = 40
CHUNK_SIZE = 20

# Length of the stored citation snippet (exigence 11's frontend needs just
# enough text to show something meaningful next to "Comment deleted" if the
# live comment is gone).
CITATION_SNIPPET_LENGTH = 200

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def compute_source_comments_hash(id_updated_pairs: Iterable[Tuple[str, str]]) -> str:
    """Hash of the sorted (comment_id, updated_at-isoformat) pairs of a
    comment set - cheap staleness fingerprint (exigence 6) that only needs
    an `id`/`updated_at` projection, never full comment content."""
    normalized = sorted((str(cid), str(updated_at)) for cid, updated_at in id_updated_pairs)
    raw = "|".join(f"{cid}:{updated_at}" for cid, updated_at in normalized)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def current_comments_hash_for_issue(issue_id) -> str:
    """The live equivalent of `IssueCommentSummary.source_comments_hash` for
    an issue's *current* comment set - compare the two to derive `is_stale`.
    """
    from plane.db.models import IssueComment

    pairs = IssueComment.objects.filter(issue_id=issue_id).values_list("id", "updated_at")
    return compute_source_comments_hash(pairs)


def _snippet(text: str, length: int = CITATION_SNIPPET_LENGTH) -> str:
    text = (text or "").strip()
    if len(text) <= length:
        return text
    return text[: length - 1].rstrip() + "…"


def _parse_llm_json(text: Optional[str]) -> Optional[dict]:
    if not text:
        return None
    text = text.strip()
    match = _JSON_FENCE_RE.search(text)
    if match:
        text = match.group(1).strip()
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def _build_comment_block(comment) -> str:
    author = comment.actor.display_name if comment.actor_id and comment.actor else "Unknown"
    created = comment.created_at.isoformat() if comment.created_at else ""
    return f"Comment (id={comment.id}, author={author}, at={created}):\n{comment.comment_stripped}"


def _summary_instructions(
    min_sentences: int = MIN_SUMMARY_SENTENCES, max_sentences: int = MAX_SUMMARY_SENTENCES
) -> str:
    return (
        "You are an assistant that summarizes a project-management issue's comment thread for a "
        "teammate catching up after being away. Read the comments provided below and write a "
        f"condensed summary of {min_sentences} to {max_sentences} sentences covering the key "
        "decisions, direction changes, and open questions. Where the summary states something a "
        "specific comment said, add an inline numbered citation marker like [1], [2] right after "
        "it (reuse the same marker number if you cite the same comment again). "
        "Respond with the majority language of the thread; if you cannot determine it, respond "
        "in English. "
        "Respond with ONLY a single JSON object, no markdown code fence, no extra prose, in "
        'exactly this shape: {"summary": "<summary text with inline [n] markers>", "citations": '
        '[{"marker": <int>, "comment_id": "<uuid of a comment given below>"}, ...]}. '
        "Only ever put a `comment_id` in `citations` that is explicitly given to you below - never "
        "invent one."
    )


def _call_structured_summary(
    workspace, task: str, prompt: str, valid_comment_ids: set
) -> Tuple[Optional[dict], Optional[str]]:
    """Calls the shared per-workspace LLM helper, parses the structured JSON
    response, and validates citations against `valid_comment_ids`. Returns
    (result, error) - result is None if the call or parse failed."""
    text, error = get_workspace_llm_response(workspace, task, prompt)
    if error:
        return None, error

    parsed = _parse_llm_json(text)
    if parsed is None or "summary" not in parsed:
        return None, "The AI provider returned a response that could not be parsed."

    raw_citations = parsed.get("citations") or []
    validated_citations = []
    for entry in raw_citations:
        if not isinstance(entry, dict):
            continue
        comment_id = str(entry.get("comment_id") or "")
        if comment_id not in valid_comment_ids:
            continue
        try:
            marker = int(entry.get("marker"))
        except (TypeError, ValueError):
            continue
        validated_citations.append({"marker": marker, "comment_id": comment_id})

    return {"summary": str(parsed.get("summary") or ""), "citations": validated_citations}, None


def _summarize_comments(workspace, comments: list) -> Tuple[Optional[dict], Optional[str]]:
    """Single-pass summary over a (small enough) list of IssueComment rows."""
    valid_ids = {str(c.id) for c in comments}
    prompt = "\n\n".join(_build_comment_block(c) for c in comments)
    return _call_structured_summary(workspace, _summary_instructions(), prompt, valid_ids)


def _attach_snippets(citations: list, comments_by_id: dict) -> list:
    result = []
    for citation in citations:
        comment = comments_by_id.get(citation["comment_id"])
        snippet = _snippet(comment.comment_stripped) if comment else ""
        result.append({"marker": citation["marker"], "comment_id": citation["comment_id"], "snippet": snippet})
    return result


def _chunk(items: list, size: int) -> List[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def _generate_hierarchical_summary(workspace, comments: list) -> Tuple[Optional[dict], Optional[str]]:
    """2-level hierarchical summary (exigence 10). Stage 1 summarizes each
    chronological chunk independently (citations already validated against
    real comment ids). Stage 2 synthesizes the chunk summaries into one
    overall summary - its citations are validated AGAIN against the FULL
    original comment-id set below, so they can never end up pointing at an
    intermediate chunk-summary identity, only ever at a real IssueComment.
    """
    comments_by_id = {str(c.id): c for c in comments}
    all_valid_ids = set(comments_by_id.keys())
    chunk_summaries = []
    citation_pool: dict = {}

    for chunk_comments in _chunk(comments, CHUNK_SIZE):
        result, error = _summarize_comments(workspace, chunk_comments)
        if error or result is None:
            return None, error or "Failed to summarize a segment of the thread."
        chunk_summaries.append(result["summary"])
        for citation in result["citations"]:
            citation_pool.setdefault(citation["comment_id"], citation)

    candidate_lines = "\n".join(
        f'- comment_id={cid}, snippet="{_snippet(comments_by_id[cid].comment_stripped)}"' for cid in citation_pool
    )
    segments_text = "\n\n".join(f"Segment {i + 1} summary: {text}" for i, text in enumerate(chunk_summaries))
    synthesis_prompt = (
        f"{segments_text}\n\nAvailable citation candidates (only use comment_id values from this "
        f"list):\n{candidate_lines if candidate_lines else '(none available)'}"
    )
    task = (
        _summary_instructions()
        + " The thread was too long to read in one pass, so you are given per-segment summaries "
        "instead of raw comments - write one overall summary synthesizing all segments. Only use "
        "`comment_id` values from the 'Available citation candidates' list, never a segment number."
    )

    result, error = _call_structured_summary(workspace, task, synthesis_prompt, all_valid_ids)
    if error or result is None:
        return None, error or "Failed to synthesize the segment summaries."
    return result, None


def generate_summary_for_issue(issue_id, actor_id=None) -> None:
    """Generates (or regenerates) the `IssueCommentSummary` for `issue_id`.
    Never raises - any failure (LLM error, parse error, unexpected
    exception) is caught, logged server-side via `log_exception`, and
    recorded as `status=FAILED` with a server-only `error_message` (exigence
    9 - the UI only ever shows a generic failure message).

    Expects an `IssueCommentSummary` row to already exist for this issue
    (created by the view in PENDING status) - creates one defensively if
    missing so this function is also safely callable on its own (e.g. from
    tests) without going through the view first.
    """
    from plane.db.models import Issue, IssueComment, IssueCommentSummary, IssueCommentSummaryStatus

    try:
        issue = Issue.objects.select_related("workspace", "project").filter(id=issue_id).first()
        if issue is None:
            return

        summary, _ = IssueCommentSummary.objects.get_or_create(
            issue=issue,
            defaults={"project_id": issue.project_id, "workspace_id": issue.workspace_id},
        )

        comments = list(
            IssueComment.objects.filter(issue_id=issue_id)
            .select_related("actor")
            .order_by("created_at")
        )

        comments_hash = compute_source_comments_hash((c.id, c.updated_at) for c in comments)

        if not comments:
            summary.status = IssueCommentSummaryStatus.FAILED
            summary.error_message = "No comments to summarize."
            summary.source_comment_count = 0
            summary.source_comments_hash = comments_hash
            summary.save()
            return

        if len(comments) > CHUNK_THRESHOLD:
            result, error = _generate_hierarchical_summary(issue.workspace, comments)
        else:
            result, error = _summarize_comments(issue.workspace, comments)

        if error or result is None:
            summary.status = IssueCommentSummaryStatus.FAILED
            summary.error_message = error or "Unknown error generating summary."
            summary.source_comment_count = len(comments)
            summary.source_comments_hash = comments_hash
            summary.save()
            return

        comments_by_id = {str(c.id): c for c in comments}
        config = get_workspace_ai_config(issue.workspace)

        summary.summary_text = result["summary"]
        summary.citations = _attach_snippets(result["citations"], comments_by_id)
        summary.source_comment_count = len(comments)
        summary.source_comments_hash = comments_hash
        summary.status = IssueCommentSummaryStatus.COMPLETED
        summary.error_message = None
        summary.model_used = config.model_name if config else ""
        summary.generated_by_id = actor_id
        summary.generated_at = timezone.now()
        summary.save()
    except Exception as e:  # noqa: BLE001 - must never raise past this point (exigence 9)
        log_exception(e)
        try:
            from plane.db.models import IssueCommentSummary, IssueCommentSummaryStatus

            IssueCommentSummary.objects.filter(issue_id=issue_id).update(
                status=IssueCommentSummaryStatus.FAILED,
                error_message=str(e),
            )
        except Exception as inner_e:  # noqa: BLE001
            log_exception(inner_e)
