# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 6 - "Redaction assistee des mises a jour de
statut" (AI-assisted status update drafting).

SCOPE, already decided, not to be re-litigated: PROJECT ONLY in v1. The
spec's own requirement 1 wants a single shared generation service across
Cycle, Module, AND Project updates. That premise does not hold in this
fork: only `ProjectUpdate` exists (see `plane.db.models.project_update`) -
there is no `CycleUpdate`/`ModuleUpdate`/abstract `EntityUpdate` base model
anywhere, and no frontend for cycle/module updates either. Building those
from scratch was explicitly ruled out of scope for this feature. Everything
below only ever touches `Project`/`ProjectUpdate` - Cycle/Module status
updates remain a real, deliberate gap for a future feature, not an
oversight, and nothing here should be read as partial support for either.

DELTA WINDOW (exigence 4/5): the *time-windowed* part of the delta -
issues that moved into a Completed-group state - is computed over
`[since, now]` where `since` is the last published `ProjectUpdate`'s
`created_at`, or `project.created_at` if none exists yet (mirrors
`plane.utils.project_update_summary`'s exact `since` resolution). The other
three delta components (overdue, blocked, remaining-work distribution) are
deliberately CURRENT-STATE snapshots, not time-windowed - an issue is
either overdue or blocked *right now* or it isn't; there's no meaningful
sense in which an issue was "overdue since last update" that isn't already
implied by it being overdue now, and the same is true for the distribution.

REUSE DECISION vs. `plane.utils.project_update_summary`: that module was
checked first, per the task's own instruction to prefer extending it. It
computes coarse *counts* (issues_created/completed/cancelled,
net_backlog_change, cycles_started/closed) for the existing manual-update
"since last update" summary block (`ProjectUpdate.generated_summary_json`)
- a UI-facing digest of aggregate numbers. This feature needs the opposite
shape: per-issue detail (id, name, state, assignees, optionally
description) for completed/overdue/blocked issues, suitable for feeding an
LLM prompt and for `ProjectUpdate.ai_source_snapshot`'s reproducibility
requirement - not counts. The two don't overlap enough to share code
without distorting one or the other (e.g. `generate_project_update_summary`
has no notion of "overdue" or "blocked" at all, and its `completed`/
`cancelled` counting is deliberately count-only, not issue-level). Building
fresh here, rather than forcing a fit, was the judgment call - see the
`AI_DRAFT.md`-equivalent context above for why.

REGENERATION CAP MECHANISM (exigence 9): "N regenerations per draft-editing
cycle of the same UNPUBLISHED update" has no natural DB row to increment
against before a `ProjectUpdate` is ever created (see feature scope note in
`plane.app.views.project_update.ai_draft`). Mechanism chosen: a cache key
scoped to `(project_id, current_cycle_marker)`, where `current_cycle_marker`
is the id of the project's most-recently-PUBLISHED `ProjectUpdate` (or
"none"). Every time a human actually publishes a new update, that marker
changes, so the next generation request naturally starts counting from a
fresh (never-yet-seen) cache key - no explicit reset/signal needed (this
fork uses no Django signals). The counter has a bounded TTL as a
belt-and-braces cleanup for abandoned drafts that are never published.

LANGUAGE (exigence 14): `Workspace` has no language/locale field in this
fork (confirmed, not silently skipped). Building new i18n infrastructure
for this single feature was judged disproportionate - the prompt does not
force a language; the LLM responds in whatever language its own
English-language instructions naturally elicit (typically English). This
is a real, documented gap, not an oversight.
"""

import json
import re
import time
from typing import Optional

from django.core.cache import cache
from django.db.models import Count
from django.utils import timezone

from plane.utils.exception_logger import log_exception

# Exigence 10 - 20s hard timeout on the LLM call.
LLM_TIMEOUT_SECONDS = 20

# Safety cap on how many issues of each delta category are actually listed
# in the prompt / stored in the snapshot - keeps prompt size (and therefore
# cost/latency) bounded for very large projects. Not spec-mandated, a
# deliberate implementation safety margin.
MAX_ISSUES_PER_SECTION = 40

# How long an unpublished draft's regeneration counter is kept - long
# enough to cover a realistic editing session, short enough that an
# abandoned draft doesn't hold state forever.
REGENERATION_CACHE_TTL = 60 * 60 * 6  # 6 hours

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


# ---------------------------------------------------------------------------
# Delta computation
# ---------------------------------------------------------------------------


def _terminal_state_groups():
    from plane.db.models import StateGroup

    return [StateGroup.COMPLETED.value, StateGroup.CANCELLED.value]


def _serialize_issue(issue, include_description, **extra):
    data = {
        "id": str(issue.id),
        "name": issue.name,
        "priority": issue.priority,
        "state": issue.state.name if issue.state_id and issue.state else None,
        # Exigence 12 - assignee display names are "already visible in the
        # workspace" so they're included regardless of data_scope.
        "assignee_names": [u.display_name or u.email for u in issue.assignees.all()],
    }
    if include_description and issue.description_stripped:
        data["description"] = issue.description_stripped[:1000]
    data.update(extra)
    return data


def compute_project_update_delta(project, data_scope, since=None):
    """Returns a JSON-safe dict of everything needed to draft an update and
    to freeze into `ProjectUpdate.ai_source_snapshot`. `data_scope` is one
    of `WorkspaceAIUpdateDataScope` - full issue descriptions are only ever
    fetched (let alone included) when it's `FULL_DESCRIPTIONS`, so a
    `TITLES_STATES_ONLY` workspace never has description text pass through
    this function at all, not just "not sent to the LLM" - it never even
    reaches the snapshot stored for audit.
    """
    from plane.db.models import Issue, IssueRelation, IssueRelationChoices, ProjectUpdate, WorkspaceAIUpdateDataScope

    terminal_groups = _terminal_state_groups()

    if since is None:
        last_update = ProjectUpdate.objects.filter(project=project).order_by("-created_at").first()
        since = last_update.created_at if last_update else project.created_at

    now = timezone.now()
    include_description = data_scope == WorkspaceAIUpdateDataScope.FULL_DESCRIPTIONS

    # -- Time-windowed: issues completed since `since` (exigence 4/5) ------
    completed_qs = (
        Issue.issue_objects.filter(
            project=project, completed_at__isnull=False, completed_at__gte=since, completed_at__lte=now
        )
        .select_related("state")
        .prefetch_related("assignees")
        .order_by("-completed_at")[:MAX_ISSUES_PER_SECTION]
    )
    completed_issues = [
        _serialize_issue(issue, include_description, completed_at=issue.completed_at.isoformat())
        for issue in completed_qs
    ]

    # -- Current snapshot: overdue issues (target_date passed, non-terminal)
    overdue_qs = (
        Issue.issue_objects.filter(project=project, target_date__isnull=False, target_date__lt=now.date())
        .exclude(state__group__in=terminal_groups)
        .select_related("state")
        .prefetch_related("assignees")
        .order_by("target_date")[:MAX_ISSUES_PER_SECTION]
    )
    overdue_issues = [
        _serialize_issue(issue, include_description, target_date=issue.target_date.isoformat())
        for issue in overdue_qs
    ]

    # -- Current snapshot: blocked issues via IssueRelation BLOCKED_BY, ----
    # neither the blocked issue nor its blocker resolved yet ("non resolue")
    blocked_qs = (
        IssueRelation.objects.filter(relation_type=IssueRelationChoices.BLOCKED_BY, issue__project=project)
        .exclude(issue__state__group__in=terminal_groups)
        .exclude(related_issue__state__group__in=terminal_groups)
        .select_related("issue", "issue__state", "related_issue")
        .prefetch_related("issue__assignees")
        .order_by("-created_at")
    )
    blocked_issues = []
    seen_blocked_ids = set()
    for relation in blocked_qs:
        if str(relation.issue_id) in seen_blocked_ids:
            continue
        seen_blocked_ids.add(str(relation.issue_id))
        blocked_issues.append(
            _serialize_issue(
                relation.issue,
                include_description,
                blocked_by_id=str(relation.related_issue_id),
                blocked_by_name=relation.related_issue.name,
            )
        )
        if len(blocked_issues) >= MAX_ISSUES_PER_SECTION:
            break

    # -- Current snapshot: remaining (non-terminal) work by state group ----
    distribution_rows = (
        Issue.issue_objects.filter(project=project)
        .exclude(state__group__in=terminal_groups)
        .values("state__group")
        .annotate(count=Count("id"))
    )
    remaining_distribution = {row["state__group"]: row["count"] for row in distribution_rows if row["state__group"]}

    return {
        "since": since.isoformat() if hasattr(since, "isoformat") else since,
        "computed_at": now.isoformat(),
        "data_scope": data_scope,
        "completed_issues": completed_issues,
        "overdue_issues": overdue_issues,
        "blocked_issues": blocked_issues,
        "remaining_distribution": remaining_distribution,
    }


# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------


def _format_issue_line(issue: dict) -> str:
    bits = [issue["name"]]
    meta = [f"state: {issue.get('state') or 'n/a'}"]
    if issue.get("priority"):
        meta.append(f"priority: {issue['priority']}")
    if issue.get("assignee_names"):
        meta.append(f"assignees: {', '.join(issue['assignee_names'])}")
    if issue.get("completed_at"):
        meta.append(f"completed_at: {issue['completed_at']}")
    if issue.get("target_date"):
        meta.append(f"target_date: {issue['target_date']}")
    if issue.get("blocked_by_name"):
        meta.append(f"blocked_by: {issue['blocked_by_name']}")
    line = f"- {bits[0]} ({'; '.join(meta)})"
    if issue.get("description"):
        line += f"\n  description: {issue['description']}"
    return line


def _build_user_prompt(project, delta: dict) -> str:
    lines = [f"Project: {project.name}", f"Delta window start: {delta['since']}", ""]

    lines.append(f"Issues completed since the last update ({len(delta['completed_issues'])}):")
    lines += [_format_issue_line(i) for i in delta["completed_issues"]] or ["(none)"]
    lines.append("")

    lines.append(f"Overdue issues, not yet completed/cancelled ({len(delta['overdue_issues'])}):")
    lines += [_format_issue_line(i) for i in delta["overdue_issues"]] or ["(none)"]
    lines.append("")

    lines.append(f"Blocked issues, neither the issue nor its blocker resolved ({len(delta['blocked_issues'])}):")
    lines += [_format_issue_line(i) for i in delta["blocked_issues"]] or ["(none)"]
    lines.append("")

    lines.append("Current distribution of remaining (non-completed, non-cancelled) issues by state group:")
    if delta["remaining_distribution"]:
        lines += [f"- {group}: {count}" for group, count in delta["remaining_distribution"].items()]
    else:
        lines.append("(none)")

    return "\n".join(lines)


def _draft_instructions() -> str:
    from plane.db.models import ProjectUpdate

    status_options = " or ".join(f'"{v}"' for v in ProjectUpdate.StatusChoice.values)
    return (
        "You are an assistant that drafts a concise, professional project status update for "
        "stakeholders, based on structured data about issue changes since the last update. Write "
        "3 to 6 sentences of plain narrative prose (no markdown headers or bullet lists) covering "
        "what was completed, what's overdue or blocked, and the overall trajectory. Respond in "
        "English unless the data itself strongly suggests another language. "
        "Respond with ONLY a single JSON object, no markdown code fence, no extra prose, in exactly "
        'this shape: {"status": <one of ' + status_options + '>, "update": "<drafted update text>"}. '
        "Only ever use one of those exact values for `status`."
    )


def _parse_llm_json(text: Optional[str]) -> Optional[dict]:
    """Tolerant structured-JSON parser - same shape/rationale as
    `plane.utils.issue_comment_summary._parse_llm_json` (some providers wrap
    JSON in a markdown fence even when told not to). Kept as a small, local
    duplicate rather than a shared import - this feature has no other
    dependency on that module and the function is a handful of lines.
    """
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
    return parsed if isinstance(parsed, dict) else None


def _heuristic_status(delta: dict):
    """Fallback suggested status (exigence 6) when the LLM response can't be
    parsed or omits a valid `status` - derived from the same delta data
    rather than defaulting blindly to ON_TRACK.
    """
    from plane.db.models import ProjectUpdate

    blocked_count = len(delta.get("blocked_issues", []))
    overdue_count = len(delta.get("overdue_issues", []))
    if blocked_count == 0 and overdue_count == 0:
        return ProjectUpdate.StatusChoice.ON_TRACK
    if blocked_count >= 3 or overdue_count >= 3:
        return ProjectUpdate.StatusChoice.OFF_TRACK
    return ProjectUpdate.StatusChoice.AT_RISK


# ---------------------------------------------------------------------------
# Generation + audit logging
# ---------------------------------------------------------------------------


def generate_project_update_draft(project, workspace, user) -> dict:
    """Computes the delta, calls the LLM, and writes an `AIGenerationLog`
    row for the attempt (success or failure - exigence 13). NEVER creates a
    `ProjectUpdate` row (see `plane.app.views.project_update.ai_draft`
    module docstring) and never raises - any unexpected exception is caught
    and reported as a FAILED attempt, exactly like an LLM-side error, so a
    bug here can never take down the endpoint with a 500.

    Returns a dict with keys: `error` (None on success), `draft_content`,
    `suggested_status`, `ai_generation_status`, `ai_generation_metadata`,
    `ai_source_snapshot`.
    """
    from plane.db.models import AIGenerationLog, AIGenerationStatus, ProjectUpdate
    from plane.utils.workspace_ai import get_workspace_ai_config, get_workspace_llm_response

    ai_config = get_workspace_ai_config(workspace)
    provider = ai_config.provider if ai_config else None
    model_name = ai_config.model_name if ai_config else ""

    def _log_failure(error_message, gen_status):
        try:
            AIGenerationLog.objects.create(
                project=project,
                triggered_by=user,
                status=gen_status,
                provider=provider,
                model_name=model_name,
                token_usage={},
                error_message=error_message,
            )
        except Exception as log_error:  # noqa: BLE001 - logging must never mask the real error
            log_exception(log_error)

    try:
        data_scope = workspace.ai_update_data_scope
        delta = compute_project_update_delta(project, data_scope)
        user_prompt = _build_user_prompt(project, delta)

        started = time.monotonic()
        text, error = get_workspace_llm_response(
            workspace, _draft_instructions(), user_prompt, timeout=LLM_TIMEOUT_SECONDS
        )
        latency_ms = int((time.monotonic() - started) * 1000)

        if error:
            gen_status = AIGenerationStatus.TIMEOUT if "timed out" in error.lower() else AIGenerationStatus.FAILED
            _log_failure(error, gen_status)
            return {
                "error": error,
                "draft_content": None,
                "suggested_status": None,
                "ai_generation_status": gen_status,
                "ai_generation_metadata": None,
                "ai_source_snapshot": delta,
            }

        parsed = _parse_llm_json(text)
        draft_text = None
        suggested_status = None
        if parsed:
            draft_text = str(parsed.get("update") or "").strip() or None
            candidate_status = parsed.get("status")
            if candidate_status in ProjectUpdate.StatusChoice.values:
                suggested_status = candidate_status

        if draft_text is None:
            # The model didn't return the requested structured shape - fall
            # back to its raw text response verbatim rather than failing
            # outright, still useful as an edit starting point.
            draft_text = (text or "").strip()

        if not draft_text:
            error_message = "The AI provider returned an empty response."
            _log_failure(error_message, AIGenerationStatus.FAILED)
            return {
                "error": error_message,
                "draft_content": None,
                "suggested_status": None,
                "ai_generation_status": AIGenerationStatus.FAILED,
                "ai_generation_metadata": None,
                "ai_source_snapshot": delta,
            }

        if suggested_status is None:
            suggested_status = _heuristic_status(delta)

        metadata = {
            "llm_provider": provider,
            "llm_model": model_name,
            # Documented gap: the shared call_llm()/get_workspace_llm_response()
            # helper does not currently surface provider token-usage counts -
            # see plane.utils.workspace_ai. Left None rather than guessed.
            "prompt_tokens": None,
            "completion_tokens": None,
            "latency_ms": latency_ms,
        }

        AIGenerationLog.objects.create(
            project=project,
            triggered_by=user,
            status=AIGenerationStatus.SUCCESS,
            provider=provider,
            model_name=model_name,
            token_usage=metadata,
            error_message=None,
        )

        return {
            "error": None,
            "draft_content": draft_text,
            "suggested_status": suggested_status,
            "ai_generation_status": AIGenerationStatus.SUCCESS,
            "ai_generation_metadata": metadata,
            "ai_source_snapshot": delta,
        }
    except Exception as e:  # noqa: BLE001 - must never raise past this point
        log_exception(e)
        error_message = "An unexpected error occurred while generating the draft."
        _log_failure(error_message, AIGenerationStatus.FAILED)
        return {
            "error": error_message,
            "draft_content": None,
            "suggested_status": None,
            "ai_generation_status": AIGenerationStatus.FAILED,
            "ai_generation_metadata": None,
            "ai_source_snapshot": None,
        }


# ---------------------------------------------------------------------------
# Regeneration cap (exigence 9) - see module docstring for the mechanism.
# ---------------------------------------------------------------------------


def _current_draft_cycle_marker(project) -> str:
    from plane.db.models import ProjectUpdate

    last_update = ProjectUpdate.objects.filter(project=project).order_by("-created_at").first()
    return str(last_update.id) if last_update else "none"


def _regeneration_cache_key(project_id, marker: str) -> str:
    return f"ai_update_draft_regen:{project_id}:{marker}"


def peek_regeneration_count(project) -> int:
    """Current attempt count for this project's active (unpublished) draft
    cycle, without incrementing it."""
    key = _regeneration_cache_key(project.id, _current_draft_cycle_marker(project))
    return cache.get(key, 0)


def increment_regeneration_count(project) -> int:
    key = _regeneration_cache_key(project.id, _current_draft_cycle_marker(project))
    try:
        return cache.incr(key)
    except ValueError:
        # Key doesn't exist yet in this cache backend.
        cache.set(key, 1, timeout=REGENERATION_CACHE_TTL)
        return 1
