# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Content aggregation + rendering for category 9 (AI features,
docs/feature-specs/09-ai-features.md in plane-selfhost), feature 5 -
"Digest periodique automatise". See `plane.bgtasks.digest_task` for the
Celery beat scheduling/orchestration that calls into this module, and
`plane.db.models.digest` for the model shapes.

CONTENT SOURCES PULLED (exigence 4): issues created, issue state
transitions - split into `ISSUE_COMPLETED` (new state's group is
`completed` OR `cancelled`) vs `ISSUE_STATE_CHANGED` (any other state
GROUP transition - a same-group move, e.g. reordering within `backlog`,
is deliberately not "significant" and is skipped) - both derived from a
single `IssueActivity(field="state")` scan, mirroring the existing
`plane.utils.project_update_summary.generate_project_update_summary`
precedent for detecting cancellations (no `cancelled_at` field exists on
`Issue`, only `completed_at`, which itself only covers the `completed`
group - see `Issue.save()`). Comment mentions reuse
`plane.bgtasks.notification_task.extract_comment_mentions` (the same
`<mention-component>` parsing every other notification path in this fork
uses) rather than a second mention-detection mechanism. Cycle start/
completion use `Coalesce(actual_start_date, start_date)` /
`Coalesce(actual_end_date, end_date)` (manual start/stop takes priority
over the scheduled date, matching the cycle model's own semantics). Cycle
scope changes reuse the exact `CycleIssue.all_objects` + `created_at`/
`deleted_at` precedent `plane.utils.analytics_plot.cycle_scope_plot`
already established for the cycle burndown chart's historical scope line.

CURRENT-ACCESS RECOMPUTE (exigence 5): every collector is scoped to
`project_ids`, which is always freshly resolved from the user's CURRENT
active `ProjectMember` rows (`_get_active_project_ids_for_user`) intersected
with the preference's scope - never from stale membership captured when an
activity event happened. Deliberately NOT additionally re-checked at the
individual issue level (e.g. an issue itself being archived/soft-deleted
between the event and generation time) - the tested/required guarantee is
project-level access, and `Issue.issue_objects` already excludes archived/
draft/soft-deleted issues for the ISSUE_CREATED collector specifically.

TEMPLATE IS ALWAYS COMPUTED FIRST: `render_digest` builds the plain
grouped-text summary unconditionally, then only ATTEMPTS an LLM-enriched
rephrasing on top if the workspace has both `is_digest_llm_enrichment_enabled`
and a real enabled `WorkspaceAIConfig` - any failure (missing config, LLM
error, exception) falls back to returning the already-computed template
text with `generation_method=TEMPLATE`, never blocking or failing the
digest (exigence 12's "le digest reste 100% fonctionnel en mode
templatise"). LLM mode re-phrases the same grouped facts, it never invents
a free-form structure.
"""

from django.db.models.functions import Coalesce

from plane.bgtasks.notification_task import extract_comment_mentions
from plane.db.models import (
    Cycle,
    CycleIssue,
    DigestGenerationMethod,
    DigestItem,
    DigestItemType,
    DigestScope,
    Issue,
    IssueActivity,
    IssueComment,
    Project,
    ProjectMember,
    State,
    StateGroup,
    UserFavorite,
)
from plane.utils.exception_logger import log_exception
from plane.utils.workspace_ai import get_workspace_ai_config, get_workspace_llm_response

_TYPE_ORDER = [
    DigestItemType.ISSUE_CREATED,
    DigestItemType.ISSUE_COMPLETED,
    DigestItemType.ISSUE_STATE_CHANGED,
    DigestItemType.COMMENT_MENTION,
    DigestItemType.CYCLE_STARTED,
    DigestItemType.CYCLE_COMPLETED,
    DigestItemType.CYCLE_SCOPE_CHANGED,
]

_ITEM_TYPE_LABELS = {
    DigestItemType.ISSUE_CREATED: "Issues created",
    DigestItemType.ISSUE_COMPLETED: "Issues completed / cancelled",
    DigestItemType.ISSUE_STATE_CHANGED: "Significant state changes",
    DigestItemType.COMMENT_MENTION: "Comments mentioning you",
    DigestItemType.CYCLE_STARTED: "Cycles started",
    DigestItemType.CYCLE_COMPLETED: "Cycles completed",
    DigestItemType.CYCLE_SCOPE_CHANGED: "Cycle scope changes",
}


def _get_active_project_ids_for_user(user, workspace) -> set:
    """The set of project ids `user` currently has ACTIVE `ProjectMember`
    membership in, within `workspace` - recomputed fresh every call, never
    cached/reused from an earlier point in time (exigence 5)."""
    if user is None or getattr(user, "is_anonymous", False):
        return set()
    return set(
        ProjectMember.objects.filter(workspace_id=workspace.id, member_id=user.id, is_active=True).values_list(
            "project_id", flat=True
        )
    )


def resolve_scoped_project_ids(user, workspace, preference) -> set:
    """Resolves `DigestPreference.scope` into a concrete set of project
    ids, always intersected with the user's CURRENT active membership -
    so `FAVORITES_ONLY`/`CUSTOM` can never resurrect a project the user
    has since lost access to, and `ALL_PROJECTS` is exactly "every
    project the user is an active member of right now".

    FAVORITES_ONLY is deliberately project-level only (favorited projects
    via `UserFavorite(entity_type="project")`), not also expanded to
    "projects containing a favorited cycle" - the spec's own wording
    ("projets/cycles marques favoris") gestures at cycle-level favorites
    too, but `DigestPreference.scope` is a single project-granularity
    field, so this keeps scoping simple/predictable rather than silently
    pulling in an entire project just because one of its cycles was
    favorited.
    """
    active_project_ids = _get_active_project_ids_for_user(user, workspace)
    if not active_project_ids:
        return set()

    if preference.scope == DigestScope.FAVORITES_ONLY:
        favorited_ids = set(
            UserFavorite.objects.filter(
                user=user, workspace=workspace, entity_type="project", deleted_at__isnull=True
            ).values_list("entity_identifier", flat=True)
        )
        return active_project_ids & favorited_ids

    if preference.scope == DigestScope.CUSTOM:
        custom_ids = set(preference.custom_projects.values_list("id", flat=True))
        return active_project_ids & custom_ids

    # ALL_PROJECTS (and any unrecognized value - fail safe to "everything
    # the user can currently see", never silently expand access).
    return active_project_ids


def _collect_issue_created(project_ids, period_start, period_end):
    issues = (
        Issue.issue_objects.filter(
            project_id__in=project_ids, created_at__gte=period_start, created_at__lt=period_end
        )
        .select_related("project", "state")
        .order_by("created_at")
    )
    items = []
    for issue in issues:
        items.append(
            {
                "item_type": DigestItemType.ISSUE_CREATED,
                "project_id": issue.project_id,
                "cycle_id": None,
                "issue_id": issue.id,
                "actor_id": issue.created_by_id,
                "payload": {
                    "issue_name": issue.name,
                    "issue_sequence": f"{issue.project.identifier}-{issue.sequence_id}",
                    "state_name": issue.state.name if issue.state else None,
                },
                "sort_key": issue.created_at,
            }
        )
    return items


def _collect_state_transitions(project_ids, period_start, period_end):
    """Single scan covering both `ISSUE_COMPLETED` (new state group is
    `completed`/`cancelled`) and `ISSUE_STATE_CHANGED` (any other real
    state-group transition). A same-group move (old group == new group)
    is not considered significant and is skipped.
    """
    activities = list(
        IssueActivity.objects.filter(
            project_id__in=project_ids,
            field="state",
            created_at__gte=period_start,
            created_at__lt=period_end,
            new_identifier__isnull=False,
        )
        .select_related("issue")
        .order_by("created_at")
    )
    if not activities:
        return []

    state_ids = set()
    for activity in activities:
        if activity.old_identifier:
            state_ids.add(activity.old_identifier)
        state_ids.add(activity.new_identifier)

    states = State.objects.filter(id__in=state_ids).values("id", "group", "name")
    state_groups = {s["id"]: s["group"] for s in states}
    state_names = {s["id"]: s["name"] for s in states}

    items = []
    for activity in activities:
        if activity.issue_id is None:
            continue
        old_group = state_groups.get(activity.old_identifier)
        new_group = state_groups.get(activity.new_identifier)
        if old_group == new_group:
            continue

        item_type = (
            DigestItemType.ISSUE_COMPLETED
            if new_group in (StateGroup.COMPLETED, StateGroup.CANCELLED)
            else DigestItemType.ISSUE_STATE_CHANGED
        )
        items.append(
            {
                "item_type": item_type,
                "project_id": activity.project_id,
                "cycle_id": None,
                "issue_id": activity.issue_id,
                "actor_id": activity.actor_id,
                "payload": {
                    "issue_name": activity.issue.name if activity.issue else None,
                    "old_state": state_names.get(activity.old_identifier),
                    "new_state": state_names.get(activity.new_identifier),
                },
                "sort_key": activity.created_at,
            }
        )
    return items


def _collect_comment_mentions(user, project_ids, period_start, period_end):
    comments = (
        IssueComment.objects.filter(
            project_id__in=project_ids, created_at__gte=period_start, created_at__lt=period_end
        )
        .exclude(actor_id=user.id)
        .select_related("issue")
        .order_by("created_at")
    )
    user_id_str = str(user.id)
    items = []
    for comment in comments:
        if user_id_str not in extract_comment_mentions(comment.comment_html):
            continue
        items.append(
            {
                "item_type": DigestItemType.COMMENT_MENTION,
                "project_id": comment.project_id,
                "cycle_id": None,
                "issue_id": comment.issue_id,
                "actor_id": comment.actor_id,
                "payload": {
                    "issue_name": comment.issue.name if comment.issue else None,
                    "comment_excerpt": (comment.comment_stripped or "")[:280],
                },
                "sort_key": comment.created_at,
            }
        )
    return items


def _collect_cycle_started(project_ids, period_start, period_end):
    cycles = (
        Cycle.objects.filter(project_id__in=project_ids)
        .annotate(effective_start=Coalesce("actual_start_date", "start_date"))
        .filter(effective_start__gte=period_start, effective_start__lt=period_end)
        .order_by("effective_start")
    )
    return [
        {
            "item_type": DigestItemType.CYCLE_STARTED,
            "project_id": cycle.project_id,
            "cycle_id": cycle.id,
            "issue_id": None,
            "actor_id": None,
            "payload": {"cycle_name": cycle.name},
            "sort_key": cycle.effective_start,
        }
        for cycle in cycles
    ]


def _collect_cycle_completed(project_ids, period_start, period_end):
    cycles = (
        Cycle.objects.filter(project_id__in=project_ids)
        .annotate(effective_end=Coalesce("actual_end_date", "end_date"))
        .filter(effective_end__gte=period_start, effective_end__lt=period_end)
        .order_by("effective_end")
    )
    return [
        {
            "item_type": DigestItemType.CYCLE_COMPLETED,
            "project_id": cycle.project_id,
            "cycle_id": cycle.id,
            "issue_id": None,
            "actor_id": None,
            "payload": {"cycle_name": cycle.name},
            "sort_key": cycle.effective_end,
        }
        for cycle in cycles
    ]


def _collect_cycle_scope_changes(project_ids, period_start, period_end):
    added = (
        CycleIssue.objects.filter(
            project_id__in=project_ids, created_at__gte=period_start, created_at__lt=period_end
        )
        .select_related("cycle", "issue")
        .order_by("created_at")
    )
    removed = (
        CycleIssue.all_objects.filter(
            project_id__in=project_ids, deleted_at__gte=period_start, deleted_at__lt=period_end
        )
        .select_related("cycle", "issue")
        .order_by("deleted_at")
    )

    items = []
    for cycle_issue in added:
        items.append(
            {
                "item_type": DigestItemType.CYCLE_SCOPE_CHANGED,
                "project_id": cycle_issue.project_id,
                "cycle_id": cycle_issue.cycle_id,
                "issue_id": cycle_issue.issue_id,
                "actor_id": cycle_issue.created_by_id,
                "payload": {
                    "change": "added",
                    "issue_name": cycle_issue.issue.name if cycle_issue.issue else None,
                    "cycle_name": cycle_issue.cycle.name if cycle_issue.cycle else None,
                },
                "sort_key": cycle_issue.created_at,
            }
        )
    for cycle_issue in removed:
        items.append(
            {
                "item_type": DigestItemType.CYCLE_SCOPE_CHANGED,
                "project_id": cycle_issue.project_id,
                "cycle_id": cycle_issue.cycle_id,
                "issue_id": cycle_issue.issue_id,
                # Best-effort only - a soft-delete's `save()` call sets
                # `updated_by` from the current request user same as any
                # other update, but that context isn't always present
                # (e.g. a management command) so this can legitimately be
                # None.
                "actor_id": cycle_issue.updated_by_id,
                "payload": {
                    "change": "removed",
                    "issue_name": cycle_issue.issue.name if cycle_issue.issue else None,
                    "cycle_name": cycle_issue.cycle.name if cycle_issue.cycle else None,
                },
                "sort_key": cycle_issue.deleted_at,
            }
        )
    return items


def aggregate_digest_content(user, workspace, preference, period_start, period_end) -> list:
    """Returns a list of plain dicts (not yet persisted `DigestItem` rows)
    describing every qualifying activity item for `user` in `workspace`
    over `[period_start, period_end)`, already sorted into a stable
    display order (project name, then item type, then chronological).
    Returns `[]` if nothing qualifies - the caller is responsible for
    treating that as `SKIPPED_EMPTY` (exigence 6).
    """
    project_ids = resolve_scoped_project_ids(user, workspace, preference)
    if not project_ids:
        return []

    raw_items = []
    raw_items += _collect_issue_created(project_ids, period_start, period_end)
    raw_items += _collect_state_transitions(project_ids, period_start, period_end)
    raw_items += _collect_comment_mentions(user, project_ids, period_start, period_end)
    raw_items += _collect_cycle_started(project_ids, period_start, period_end)
    raw_items += _collect_cycle_completed(project_ids, period_start, period_end)
    raw_items += _collect_cycle_scope_changes(project_ids, period_start, period_end)

    if not raw_items:
        return []

    project_names = dict(Project.objects.filter(id__in=project_ids).values_list("id", "name"))
    cycle_ids = {item["cycle_id"] for item in raw_items if item.get("cycle_id")}
    cycle_names = dict(Cycle.objects.filter(id__in=cycle_ids).values_list("id", "name")) if cycle_ids else {}

    for item in raw_items:
        item["payload"]["project_name"] = project_names.get(item["project_id"], "")
        if item.get("cycle_id") and not item["payload"].get("cycle_name"):
            item["payload"]["cycle_name"] = cycle_names.get(item["cycle_id"], "")

    def _sort_key(item):
        type_index = _TYPE_ORDER.index(item["item_type"]) if item["item_type"] in _TYPE_ORDER else len(_TYPE_ORDER)
        return (item["payload"].get("project_name", ""), type_index, item["sort_key"])

    raw_items.sort(key=_sort_key)
    for item in raw_items:
        item.pop("sort_key", None)

    return raw_items


def persist_digest_items(digest_run, items) -> None:
    """Bulk-creates `DigestItem` rows for an already-aggregated `items`
    list, in the order given (becomes `position`). `bulk_create` bypasses
    `ProjectBaseModel.save()`'s workspace-from-project derivation, so
    `workspace_id` is set explicitly here.
    """
    rows = [
        DigestItem(
            workspace_id=digest_run.workspace_id,
            project_id=item["project_id"],
            digest_run=digest_run,
            cycle_id=item.get("cycle_id"),
            issue_id=item.get("issue_id"),
            item_type=item["item_type"],
            actor_id=item.get("actor_id"),
            payload=item["payload"],
            position=position,
        )
        for position, item in enumerate(items)
    ]
    DigestItem.objects.bulk_create(rows, batch_size=200)


def _describe_item(item) -> str:
    payload = item["payload"]
    item_type = item["item_type"]

    if item_type == DigestItemType.ISSUE_CREATED:
        return f"{payload.get('issue_sequence', '')} {payload.get('issue_name', '')}".strip()
    if item_type == DigestItemType.ISSUE_COMPLETED:
        return f"{payload.get('issue_name', '')} -> {payload.get('new_state', '')}"
    if item_type == DigestItemType.ISSUE_STATE_CHANGED:
        return f"{payload.get('issue_name', '')}: {payload.get('old_state', '')} -> {payload.get('new_state', '')}"
    if item_type == DigestItemType.COMMENT_MENTION:
        return f"{payload.get('issue_name', '')}: \"{payload.get('comment_excerpt', '')}\""
    if item_type == DigestItemType.CYCLE_STARTED:
        return f"Cycle \"{payload.get('cycle_name', '')}\" started"
    if item_type == DigestItemType.CYCLE_COMPLETED:
        return f"Cycle \"{payload.get('cycle_name', '')}\" completed"
    if item_type == DigestItemType.CYCLE_SCOPE_CHANGED:
        verb = "added to" if payload.get("change") == "added" else "removed from"
        return f"{payload.get('issue_name', '')} {verb} cycle \"{payload.get('cycle_name', '')}\""
    return ""


def build_template_summary(items) -> str:
    """Plain, structured text - grouped by project then item type
    (exigence 12: "generateur templatise... regroupement par
    projet/cycle/type de changement, pas de prose libre"). `items` is
    assumed already sorted by `aggregate_digest_content`.
    """
    grouped: dict = {}
    project_order = []
    for item in items:
        project_name = item["payload"].get("project_name") or "Unknown project"
        if project_name not in grouped:
            grouped[project_name] = {}
            project_order.append(project_name)
        grouped[project_name].setdefault(item["item_type"], []).append(item)

    lines = []
    for project_name in project_order:
        lines.append(f"## {project_name}")
        for item_type in _TYPE_ORDER:
            type_items = grouped[project_name].get(item_type)
            if not type_items:
                continue
            lines.append(f"### {_ITEM_TYPE_LABELS[item_type]} ({len(type_items)})")
            for item in type_items:
                lines.append(f"- {_describe_item(item)}")
        lines.append("")
    return "\n".join(lines).strip()


def render_digest(workspace, items) -> "tuple[str, str]":
    """Returns `(summary_text, generation_method)`. TEMPLATE text is
    always computed first and is the guaranteed fallback - LLM enrichment
    is only ever an optional rephrasing layered on top, and any failure
    (feature disabled, no/disabled `WorkspaceAIConfig`, LLM error,
    exception) silently returns the template text unchanged (exigence 12).
    """
    template_text = build_template_summary(items)

    if not workspace.is_digest_llm_enrichment_enabled:
        return template_text, DigestGenerationMethod.TEMPLATE

    config = get_workspace_ai_config(workspace)
    if config is None or not config.is_enabled:
        return template_text, DigestGenerationMethod.TEMPLATE

    try:
        prompt = (
            "Rewrite the following structured activity digest into clear, "
            "friendly, well-organized prose for the recipient. Preserve "
            "every fact and the grouping by project and category exactly "
            "as given - do not invent, omit, or reorder information "
            "beyond what is listed below.\n\n" + template_text
        )
        enriched_text, error = get_workspace_llm_response(
            workspace, task="Digest enrichment", prompt=prompt, timeout=20
        )
        if error or not enriched_text:
            return template_text, DigestGenerationMethod.TEMPLATE
        return enriched_text, DigestGenerationMethod.LLM
    except Exception as e:  # defense in depth - LLM failure must never break a digest send
        log_exception(e)
        return template_text, DigestGenerationMethod.TEMPLATE
