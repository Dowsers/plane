# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 1 - "Auto-triage assiste par IA". Generation,
auto-apply, and revalidation logic for `plane.db.models.IssueTriageSuggestion`.
See that model's own module docstring for the module-cardinality fix and
the `rejected_fields`/`expired_fields` bookkeeping rationale.

Built entirely on top of the shared embedding pipeline
(`plane.utils.issue_embedding.compute_or_refresh_issue_embedding`/
`find_similar_issues`) - no parallel embedding mechanism here. Every entry
point below (`generate_issue_triage_suggestion`, `resolve_suggestion_fields`)
is designed to NEVER raise on expected failure modes (feature disabled,
not enough history, no embedding available, a suggested entity deleted) -
matching this codebase's existing convention for every other category 9
generation pipeline (`compute_or_refresh_issue_embedding`,
`generate_project_update_draft`).

CONFIDENCE SCORING FORMULA (deliberately simple - "keep it simple and
explainable", not a sophisticated ranking model): for a given field
(module/assignees/labels), look at the top-N similar issues found by
`find_similar_issues` and, for each candidate value that appears on at
least one of them, sum the similarity scores of the similar issues that
have that value, then divide by the sum of similarity scores of ALL the
similar issues considered. A value that every single similar issue shares
gets confidence 1.0; a value only the single most-similar issue has gets a
confidence equal to that issue's own similarity score relative to the
total. This is exactly the "sum of similarity scores of similar issues
sharing that value, normalized" shape the feature's own build instructions
call for.

EXIGENCE 9 ("never overwrite an explicitly-set field"): callers pass
`empty_fields` - the subset of {"module", "assignees", "labels"} eligible
for suggestion. `generate_issue_triage_suggestion` only ever computes
confidence/candidates for fields in that set; anything not in it gets an
empty suggestion (`[]`/`{}`) unconditionally, regardless of what the
similarity search would otherwise have found. Two different call sites
populate this set two different (both legitimate) ways - see
`plane.bgtasks.issue_triage_suggestion_task`:
  - issue CREATION: the exact fields left empty in the creation payload
    (exigence 9's literal wording) - `module` is always included, since
    Issue has no way to receive a module assignment at creation time at
    all (see IssueTriageSuggestion's own module docstring).
  - manual REGENERATION (exigence 15): generalizes the same rule to "fields
    currently empty on the live issue" (`compute_currently_empty_fields`) -
    the original creation payload is long gone by the time someone clicks
    "regenerate", so the equivalent, equally-safe rule is to never suggest
    a value for a field the issue already has ANY value in right now
    (whether a human set it, or a previous suggestion was already applied).
"""

import logging
from typing import Dict, List, Optional, Tuple

from django.utils import timezone

from plane.utils.exception_logger import log_exception
from plane.utils.issue_embedding import compute_or_refresh_issue_embedding, find_similar_issues
from plane.utils.integration_bot import get_or_create_integration_bot

logger = logging.getLogger(__name__)

# How many historical similar issues to base a suggestion on. Not
# configurable (yet) - a fixed, generous-enough default; project-level
# `ai_triage_min_historical_issues` (default 10) already gates whether we
# even attempt this at all.
TOP_N_SIMILAR_ISSUES = 10
# Below this cosine-similarity score, a "similar" issue is discarded as
# noise rather than a genuine signal for frequency stats - deliberately
# conservative (chosen, not derived from the spec, which leaves this
# unspecified) so a handful of near-random matches on a small/young project
# don't produce a confidently-wrong suggestion.
MIN_SIMILARITY_SCORE = 0.3

FIELDS = ("module", "assignees", "labels")

# Internal suggestion field name -> (IssueTriageSuggestion attribute for
# suggested ids, attribute for confidence dict, Project auto-apply flag
# attribute, Project confidence-threshold attribute).
_FIELD_ATTRS = {
    "module": (
        "suggested_module_ids",
        "confidence_modules",
        "ai_triage_auto_apply_module",
        "ai_triage_confidence_threshold_module",
    ),
    "assignees": (
        "suggested_assignee_ids",
        "confidence_assignees",
        "ai_triage_auto_apply_assignee",
        "ai_triage_confidence_threshold_assignee",
    ),
    "labels": (
        "suggested_label_ids",
        "confidence_labels",
        "ai_triage_auto_apply_labels",
        "ai_triage_confidence_threshold_labels",
    ),
}

# Internal suggestion field name -> IssueActivity.field value. "module" maps
# to the existing "modules" (plural) convention already used by
# create_module_issue_activity (plane.bgtasks.issue_activities_task) - kept
# distinct from our own internal singular "module" vocabulary (which matches
# the spec's own resolve-endpoint body example `["module", "assignees",
# "labels"]` verbatim) purely so the activity feed stays consistent with
# every other module-related activity row already in this codebase.
_ACTIVITY_FIELD_NAME = {"module": "modules", "assignees": "assignees", "labels": "labels"}


def is_ai_triage_enabled_for_project(project, workspace=None) -> bool:
    """Exigence 12 - inheritance resolution. The workspace master switch
    always wins first: if it's off, triage is off for every project in
    that workspace regardless of the project's own setting. If it's on,
    `Project.is_ai_triage_enabled`:
      - `None` (never touched) -> inherits the (already-True) workspace
        value, i.e. enabled.
      - `True`/`False` -> explicit per-project override.
    """
    workspace = workspace or project.workspace
    if not workspace.is_ai_triage_enabled:
        return False
    if project.is_ai_triage_enabled is None:
        return True
    return bool(project.is_ai_triage_enabled)


def compute_currently_empty_fields(issue) -> List[str]:
    """Exigence 9, generalized for manual regeneration - see module
    docstring. A field with ANY current value (human-set or previously
    AI-applied) is not eligible for a fresh suggestion."""
    from plane.db.models import IssueAssignee, IssueLabel, ModuleIssue

    empty = []
    if not ModuleIssue.objects.filter(issue_id=issue.id).exists():
        empty.append("module")
    if not IssueAssignee.objects.filter(issue_id=issue.id).exists():
        empty.append("assignees")
    if not IssueLabel.objects.filter(issue_id=issue.id).exists():
        empty.append("labels")
    return empty


def _bulk_field_value_map(field: str, issue_ids: List) -> Dict[str, set]:
    """`{issue_id_str: {value_id_str, ...}}` for `field` across `issue_ids`,
    in one query - avoids N+1s across up to `TOP_N_SIMILAR_ISSUES` issues."""
    from plane.db.models import IssueAssignee, IssueLabel, ModuleIssue

    if field == "module":
        rows = ModuleIssue.objects.filter(issue_id__in=issue_ids).values_list("issue_id", "module_id")
    elif field == "assignees":
        rows = IssueAssignee.objects.filter(issue_id__in=issue_ids).values_list("issue_id", "assignee_id")
    elif field == "labels":
        rows = IssueLabel.objects.filter(issue_id__in=issue_ids).values_list("issue_id", "label_id")
    else:
        return {}

    value_map: Dict[str, set] = {}
    for issue_id, value_id in rows:
        value_map.setdefault(str(issue_id), set()).add(str(value_id))
    return value_map


def _compute_field_suggestions(
    project, similar_issues: List[Tuple[object, float]], empty_fields: List[str]
) -> Dict[str, Tuple[List[str], Dict[str, float]]]:
    """Returns `{field: (ranked_ids, confidence_map)}` for all of
    `FIELDS` - fields not in `empty_fields` always come back empty (exigence
    9). See module docstring for the confidence formula."""
    similar_issue_ids = [issue.id for issue, _score in similar_issues]
    score_by_issue_id = {str(issue.id): score for issue, score in similar_issues}
    total_weight = sum(score_by_issue_id.values()) or 1.0

    results = {}
    for field in FIELDS:
        if field not in empty_fields:
            results[field] = ([], {})
            continue

        value_map = _bulk_field_value_map(field, similar_issue_ids)
        weighted: Dict[str, float] = {}
        for issue_id_str, values in value_map.items():
            score = score_by_issue_id.get(issue_id_str, 0.0)
            for value_id in values:
                weighted[value_id] = weighted.get(value_id, 0.0) + score

        confidence = {value_id: round(weight / total_weight, 4) for value_id, weight in weighted.items()}
        ranked = sorted(confidence.items(), key=lambda pair: pair[1], reverse=True)

        if field == "module":
            # Exigence 2 - "0 ou 1 module suggere" (the LOGIC cardinality,
            # not the data type - see IssueTriageSuggestion module
            # docstring re: the singular-FK fabrication fix).
            ranked = ranked[:1]
        elif field == "labels":
            ranked = ranked[: max(int(project.ai_triage_max_labels_suggested or 0), 0)]
        # "assignees": no artificial cap - naturally bounded by how many
        # distinct assignees actually appear among the similar issues found
        # (at most TOP_N_SIMILAR_ISSUES). No real per-project "max assignees"
        # field exists in this codebase to enforce the spec's own wording
        # ("dans la limite du nombre d'assignes autorise par le projet") -
        # nothing here fabricates one.

        results[field] = ([value_id for value_id, _c in ranked], dict(ranked))

    return results


def generate_issue_triage_suggestion(issue, empty_fields: Optional[List[str]] = None):
    """Core entry point - see module docstring for the two ways
    `empty_fields` gets populated by callers. Returns the (created or
    refreshed) `IssueTriageSuggestion`, or `None` if nothing was generated
    (feature disabled, not enough qualified history, no embedding
    available, or no similar issues found at all) - every one of those is
    an expected, silent no-op per exigence 10/13 ("aucune erreur visible,
    aucun etat suggestion vide affiche inutilement"). Never raises.
    """
    from plane.db.models import Issue, IssueTriageSuggestion, IssueTriageSuggestionStatus

    try:
        workspace = issue.workspace
        project = issue.project

        if not is_ai_triage_enabled_for_project(project, workspace=workspace):
            return None

        if empty_fields is None:
            empty_fields = compute_currently_empty_fields(issue)
        empty_fields = [f for f in empty_fields if f in FIELDS]
        if not empty_fields:
            return None

        qualified_count = Issue.issue_objects.filter(project_id=project.id).exclude(id=issue.id).count()
        if qualified_count < project.ai_triage_min_historical_issues:
            return None

        embedding = compute_or_refresh_issue_embedding(issue)
        if embedding is None:
            return None

        similar = find_similar_issues(
            issue,
            scope_queryset=Issue.issue_objects.filter(project_id=project.id),
            top_n=TOP_N_SIMILAR_ISSUES,
            min_score=MIN_SIMILARITY_SCORE,
        )
        if not similar:
            return None

        suggested = _compute_field_suggestions(project, similar, empty_fields)

        suggestion, _created = IssueTriageSuggestion.objects.update_or_create(
            issue=issue,
            defaults={
                "project_id": project.id,
                "workspace_id": workspace.id,
                "suggested_module_ids": suggested["module"][0],
                "confidence_modules": suggested["module"][1],
                "suggested_assignee_ids": suggested["assignees"][0],
                "confidence_assignees": suggested["assignees"][1],
                "suggested_label_ids": suggested["labels"][0],
                "confidence_labels": suggested["labels"][1],
                "similar_issue_ids": [str(i.id) for i, _score in similar],
                "generated_by_model": embedding.model_name,
                "status": IssueTriageSuggestionStatus.PENDING,
                "applied_fields": [],
                "rejected_fields": [],
                "expired_fields": [],
                "resolved_by": None,
                "resolved_at": None,
            },
        )

        _dispatch_triage_webhook(issue, "suggested", extra={"suggestion_id": str(suggestion.id)})

        _maybe_auto_apply(suggestion, issue, project)

        return suggestion
    except Exception as e:
        log_exception(e)
        return None


# ---------------------------------------------------------------------------
# Revalidation (exigence 11)
# ---------------------------------------------------------------------------


def _revalidate_field_ids(field: str, candidate_ids: List[str], project) -> List[str]:
    """Filters `candidate_ids` down to only those that still exist and still
    belong to `project` right now. Order-preserving."""
    from plane.db.models import Label, Module, ProjectMember

    if not candidate_ids:
        return []

    if field == "module":
        valid = {
            str(x)
            for x in Module.objects.filter(id__in=candidate_ids, project_id=project.id).values_list("id", flat=True)
        }
    elif field == "labels":
        valid = {
            str(x)
            for x in Label.objects.filter(id__in=candidate_ids, project_id=project.id).values_list("id", flat=True)
        }
    elif field == "assignees":
        valid = {
            str(x)
            for x in ProjectMember.objects.filter(
                member_id__in=candidate_ids, project_id=project.id, is_active=True
            ).values_list("member_id", flat=True)
        }
    else:
        valid = set()

    return [cid for cid in candidate_ids if str(cid) in valid]


# ---------------------------------------------------------------------------
# Applying a field to the issue + activity logging
# ---------------------------------------------------------------------------

def _activity_display_for(field: str, value_ids: List[str]) -> Dict[str, str]:
    from plane.db.models import Label, Module, User

    model = {"module": Module, "labels": Label, "assignees": User}[field]
    attr = "display_name" if field == "assignees" else "name"
    objs = model.objects.filter(id__in=value_ids)
    return {str(o.id): (getattr(o, attr, "") or "") for o in objs}


def _apply_field_ids_to_issue(issue, field: str, value_ids: List[str]) -> None:
    """Additive M2M application - never removes anything already present
    (exigence 9 already guarantees these fields were empty to begin with,
    so this is only ever adding, never overwriting)."""
    from plane.db.models import IssueAssignee, IssueLabel, ModuleIssue

    if not value_ids:
        return

    if field == "module":
        ModuleIssue.objects.bulk_create(
            [
                ModuleIssue(
                    issue_id=issue.id,
                    module_id=vid,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                )
                for vid in value_ids
            ],
            batch_size=50,
            ignore_conflicts=True,
        )
    elif field == "assignees":
        IssueAssignee.objects.bulk_create(
            [
                IssueAssignee(
                    issue_id=issue.id,
                    assignee_id=vid,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                )
                for vid in value_ids
            ],
            batch_size=50,
            ignore_conflicts=True,
        )
    elif field == "labels":
        IssueLabel.objects.bulk_create(
            [
                IssueLabel(
                    issue_id=issue.id,
                    label_id=vid,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                )
                for vid in value_ids
            ],
            batch_size=50,
            ignore_conflicts=True,
        )


def _log_triage_activity(issue, field: str, value_ids: List[str], actor, verb: str, is_automation: bool) -> None:
    """One `IssueActivity` row per applied value, matching the existing
    per-value granularity of `track_labels`/`track_assignees`/
    `create_module_issue_activity` (plane.bgtasks.issue_activities_task) -
    just with our own distinct verb (exigence 6) instead of theirs. Not
    dispatched through the generic `issue_activity` Celery task/`update_
    issue_activity` dispatcher: that dispatcher hardcodes `verb="updated"`/
    `"created"` for every field diff it handles, with no way to pass a
    custom verb through - exigence 6 explicitly requires a verb distinct
    from human activity (`ai_auto_applied`), so this creates the rows
    directly instead.
    """
    if not value_ids:
        return

    activity_field = _ACTIVITY_FIELD_NAME[field]
    display_names = _activity_display_for(field, value_ids)
    epoch = int(timezone.now().timestamp())

    from plane.db.models import IssueActivity

    rows = [
        IssueActivity(
            issue_id=issue.id,
            project_id=issue.project_id,
            workspace_id=issue.workspace_id,
            actor_id=actor.id,
            verb=verb,
            field=activity_field,
            old_value="",
            new_value=display_names.get(str(vid), ""),
            new_identifier=vid,
            old_identifier=None,
            comment=f"AI-suggested {field} applied: {display_names.get(str(vid), '')}".strip(),
            is_automation=is_automation,
            epoch=epoch,
        )
        for vid in value_ids
    ]
    IssueActivity.objects.bulk_create(rows, batch_size=50)


# ---------------------------------------------------------------------------
# Webhooks (best-effort - exigence 6 of the "Webhooks" considerations
# section; same try/except-and-log shape as
# plane.utils.workflow_transition_engine._dispatch_workflow_transition_webhook)
# ---------------------------------------------------------------------------


def _dispatch_triage_webhook(issue, verb: str, extra: Optional[dict] = None) -> None:
    try:
        from plane.bgtasks.webhook_task import webhook_activity

        event_data = {"issue_id": str(issue.id), "project_id": str(issue.project_id)}
        if extra:
            event_data.update(extra)

        webhook_activity.delay(
            event="issue_triage_suggestion",
            verb=verb,
            field=None,
            old_value=None,
            new_value=None,
            actor_id=None,
            slug=issue.project.workspace.slug,
            current_site=None,
            event_id=str(issue.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override=event_data,
        )
    except Exception as e:
        log_exception(e, warning=True)


# ---------------------------------------------------------------------------
# Auto-apply (exigence 5/6)
# ---------------------------------------------------------------------------


def _maybe_auto_apply(suggestion, issue, project) -> None:
    from plane.db.models.user import BotTypeEnum

    applied: List[str] = []
    expired: List[str] = []
    bot = None

    for field in FIELDS:
        ids_attr, conf_attr, auto_flag_attr, threshold_attr = _FIELD_ATTRS[field]
        candidate_ids = getattr(suggestion, ids_attr)
        if not candidate_ids:
            continue
        if not getattr(project, auto_flag_attr):
            continue

        confidence_map = getattr(suggestion, conf_attr)
        top_confidence = max(confidence_map.values()) if confidence_map else 0.0
        if top_confidence < getattr(project, threshold_attr):
            continue

        valid_ids = _revalidate_field_ids(field, candidate_ids, project)
        if not valid_ids:
            expired.append(field)
            continue

        if bot is None:
            bot = get_or_create_integration_bot(issue.workspace, BotTypeEnum.AI_TRIAGE_BOT)

        _apply_field_ids_to_issue(issue, field, valid_ids)
        _log_triage_activity(issue, field, valid_ids, actor=bot, verb="ai_auto_applied", is_automation=True)
        applied.append(field)
        _dispatch_triage_webhook(
            issue, "applied", extra={"suggestion_id": str(suggestion.id), "field": field, "applied_ids": valid_ids}
        )

    if not applied and not expired:
        return

    suggestion.applied_fields = sorted(set(suggestion.applied_fields) | set(applied))
    suggestion.expired_fields = sorted(set(suggestion.expired_fields) | set(expired))
    if applied:
        suggestion.status = _status_choices().AUTO_APPLIED
    elif expired:
        suggestion.status = _status_choices().EXPIRED
    suggestion.save(update_fields=["applied_fields", "expired_fields", "status", "updated_at"])


def _status_choices():
    from plane.db.models import IssueTriageSuggestionStatus

    return IssueTriageSuggestionStatus


# ---------------------------------------------------------------------------
# Human resolution (exigence 7) - called by the resolve endpoint
# ---------------------------------------------------------------------------


def eligible_fields_for(suggestion) -> List[str]:
    """Fields that had at least one candidate suggested in the first
    place - used to decide ACCEPTED vs PARTIALLY_ACCEPTED vs REJECTED."""
    eligible = []
    for field in FIELDS:
        ids_attr, _conf_attr, _auto_attr, _thresh_attr = _FIELD_ATTRS[field]
        if getattr(suggestion, ids_attr):
            eligible.append(field)
    return eligible


def resolve_suggestion_fields(suggestion, issue, project, action: str, fields: List[str], actor):
    """Applies (`action == "accept"`) or rejects (`action == "reject"`)
    `fields` on `suggestion`. Idempotent - a field already in
    `applied_fields`/`rejected_fields` is skipped, not re-processed.
    Returns `(newly_applied, newly_rejected, newly_expired)`. Mutates and
    saves `suggestion` (status/applied_fields/rejected_fields/
    expired_fields/resolved_by/resolved_at) but never raises - a revalidation
    failure (exigence 11) is recorded in `expired_fields`, never a 500.
    """
    newly_applied: List[str] = []
    newly_rejected: List[str] = []
    newly_expired: List[str] = []

    already_resolved = set(suggestion.applied_fields) | set(suggestion.rejected_fields)

    for field in fields:
        if field not in FIELDS or field in already_resolved:
            continue

        if action == "reject":
            newly_rejected.append(field)
            continue

        # accept
        ids_attr, _conf_attr, _auto_attr, _thresh_attr = _FIELD_ATTRS[field]
        candidate_ids = getattr(suggestion, ids_attr)
        if not candidate_ids:
            # Nothing was ever suggested for this field - no-op accept.
            continue

        valid_ids = _revalidate_field_ids(field, candidate_ids, project)
        if not valid_ids:
            newly_expired.append(field)
            continue

        _apply_field_ids_to_issue(issue, field, valid_ids)
        _log_triage_activity(issue, field, valid_ids, actor=actor, verb="ai_triage_accepted", is_automation=False)
        newly_applied.append(field)

    if newly_applied or newly_rejected or newly_expired:
        suggestion.applied_fields = sorted(set(suggestion.applied_fields) | set(newly_applied))
        suggestion.rejected_fields = sorted(set(suggestion.rejected_fields) | set(newly_rejected))
        suggestion.expired_fields = sorted(set(suggestion.expired_fields) | set(newly_expired))
        suggestion.resolved_by = actor
        suggestion.resolved_at = timezone.now()

        if newly_expired:
            # Whole-row EXPIRED - see IssueTriageSuggestion's own module
            # docstring for why this is the simpler of the two options
            # exigence 11 explicitly allows.
            suggestion.status = _status_choices().EXPIRED
        else:
            eligible = set(eligible_fields_for(suggestion))
            resolved = set(suggestion.applied_fields) | set(suggestion.rejected_fields)
            if eligible and resolved >= eligible:
                if suggestion.applied_fields and not suggestion.rejected_fields:
                    suggestion.status = _status_choices().ACCEPTED
                elif suggestion.rejected_fields and not suggestion.applied_fields:
                    suggestion.status = _status_choices().REJECTED
                else:
                    suggestion.status = _status_choices().PARTIALLY_ACCEPTED
            elif resolved:
                suggestion.status = _status_choices().PARTIALLY_ACCEPTED

        suggestion.save(
            update_fields=[
                "applied_fields",
                "rejected_fields",
                "expired_fields",
                "resolved_by",
                "resolved_at",
                "status",
                "updated_at",
            ]
        )

        if newly_applied:
            _dispatch_triage_webhook(
                issue, "applied", extra={"suggestion_id": str(suggestion.id), "fields": newly_applied}
            )
        if newly_rejected:
            _dispatch_triage_webhook(
                issue, "rejected", extra={"suggestion_id": str(suggestion.id), "fields": newly_rejected}
            )

    return newly_applied, newly_rejected, newly_expired
