# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Core generation/context/proposal logic for category 9 (AI features,
docs/feature-specs/09-ai-features.md in plane-selfhost), feature 3 -
"Assistant de chat IA in-app". See `plane.db.models.ai_chat` for the
model shapes and the module-level rationale for the decisions this module
implements (no SSE, no governed-workflows dependency, provenance without a
bot actor).

GENERATION MECHANISM - chosen: fully SYNCHRONOUS, one-shot LLM round-trip,
within the `POST .../messages/` request itself (see
`plane.app.views.ai_chat.AIConversationMessageListCreateEndpoint.post`).
Considered and rejected: a Celery task that updates `AIMessage.content`
incrementally. Reasons for sync:
  - This fork's shared `call_llm`/`get_workspace_llm_chat_response` is
    itself a single non-streaming provider call - there is no real
    per-token data to incrementally append even inside a Celery task, so
    a task would only add a network hop (enqueue + worker pickup) without
    producing anything genuinely incremental.
  - `generate_assistant_reply` below still flips `AIMessage.status` to
    `STREAMING` before the (blocking) LLM call and to `COMPLETED`/`FAILED`
    after, so a concurrent `GET .../messages/` poll issued while this
    request is in flight sees a real, meaningful "still generating" state
    - the polling contract the frontend needs is satisfied without an
    async task.
  - Fewer moving parts for a feature this large already is: no new
    Celery task needed for the common chat-panel path, no possibility of
    a task silently failing to enqueue.
The `@AI Assistant` comment-mention path (`plane.bgtasks.
ai_chat_assistant_task.handle_comment_mention`) DOES go through a Celery
task - not for streaming, but because posting a human's comment must not
block on an LLM round-trip; internally it calls this exact same
`generate_assistant_reply` synchronously once picked up by a worker.
"""

import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from django.utils import timezone

from plane.utils.access_control import can_user_access_object
from plane.utils.exception_logger import log_exception
from plane.utils.workspace_ai import get_workspace_llm_chat_response

logger = logging.getLogger(__name__)

CYCLE_FIELDS = ("name", "description", "end_date")
MODULE_FIELDS = ("name", "description", "target_date")
PAGE_FIELDS = ("name",)
ISSUE_FIELD_TO_PATCH_KEY = {
    "state": "state_id",
    "assignees": "assignee_ids",
    "labels": "label_ids",
    "target_date": "target_date",
    "priority": "priority",
}

_PROPOSAL_BLOCK_RE = re.compile(r"```json_proposals\s*(.*?)```", re.DOTALL)

# Max related/child objects pulled into context per relation kind - keeps
# the prompt bounded even on a project with hundreds of issues (open
# question 2 in the spec - "recherche structuree simple (dernier N objets
# lies)" is the v1 answer it explicitly allows).
CONTEXT_LIST_LIMIT = 10


# ---------------------------------------------------------------------------
# Feature enablement (exigence 10/11 - workspace master switch + project
# override, same inherit/override convention as every other category 9
# feature's own flat fields).
# ---------------------------------------------------------------------------


def is_ai_assistant_enabled_for_project(project, workspace=None) -> bool:
    workspace = workspace or project.workspace
    if not workspace.is_ai_assistant_enabled:
        return False
    if project.is_ai_assistant_enabled is None:
        return True
    return bool(project.is_ai_assistant_enabled)


def is_ai_assistant_available_for_workspace(workspace) -> bool:
    """Exigence 10 - both the flat toggle AND an enabled
    `WorkspaceAIConfig` are required."""
    from plane.utils.workspace_ai import get_workspace_ai_config

    if workspace is None or not workspace.is_ai_assistant_enabled:
        return False
    config = get_workspace_ai_config(workspace)
    return bool(config and config.is_enabled)


def _resolve_project_for_context(workspace, context_type, context_object_id):
    from plane.db.models import Cycle, Issue, Module, Project

    if context_object_id is None:
        return None
    if context_type == "project":
        return Project.objects.filter(id=context_object_id, workspace=workspace).first()
    if context_type == "issue":
        issue = Issue.objects.filter(id=context_object_id, workspace=workspace).select_related("project").first()
        return issue.project if issue else None
    if context_type == "cycle":
        cycle = Cycle.objects.filter(id=context_object_id, workspace=workspace).select_related("project").first()
        return cycle.project if cycle else None
    if context_type == "module":
        module = Module.objects.filter(id=context_object_id, workspace=workspace).select_related("project").first()
        return module.project if module else None
    return None


def is_ai_assistant_available_for_context(workspace, context_type, context_object_id) -> Tuple[bool, Optional[str]]:
    """Combines the workspace-level gate with the project-level override
    when the context resolves to a project-scoped object. Used at
    conversation-creation time (exigence 10/11) - backend enforcement,
    independent of whatever the frontend hides."""
    if not is_ai_assistant_available_for_workspace(workspace):
        return False, "AI assistant is not configured or not enabled for this workspace."

    project = _resolve_project_for_context(workspace, context_type, context_object_id)
    if project is not None and not is_ai_assistant_enabled_for_project(project, workspace=workspace):
        return False, "AI assistant is disabled for this project."

    return True, None


# ---------------------------------------------------------------------------
# Context building (exigence 3 - never expose an object the user can't
# read, even if reachable only via a link from an accessible object).
# ---------------------------------------------------------------------------


def build_conversation_context(user, conversation) -> str:
    from plane.db.models import Page

    workspace = conversation.workspace
    context_type = conversation.context_type
    object_id = conversation.context_object_id

    if context_type == "workspace" or object_id is None:
        return f"Workspace: {workspace.name}"

    if not can_user_access_object(user, workspace, context_type, object_id):
        return "(The original context object is no longer accessible to you.)"

    try:
        if context_type == "issue":
            return _build_issue_context(user, workspace, object_id)
        if context_type == "cycle":
            return _build_cycle_context(user, workspace, object_id)
        if context_type == "module":
            return _build_module_context(user, workspace, object_id)
        if context_type == "project":
            return _build_project_context(user, workspace, object_id)
        if context_type == "page":
            page = Page.objects.filter(id=object_id, workspace=workspace).first()
            if page is None:
                return "(Page not found.)"
            return f"Page: {page.name}\nid: {page.id}\ndescription: {(page.description_stripped or '')[:2000]}"
    except Exception as e:  # never let a context-building bug break the chat
        log_exception(e)
        return "(Context unavailable due to an internal error.)"

    return f"Workspace: {workspace.name}"


def _build_issue_context(user, workspace, issue_id) -> str:
    from plane.db.models import CycleIssue, Issue, IssueAssignee, IssueLabel, IssueRelation, ModuleIssue

    issue = Issue.issue_objects.filter(id=issue_id, workspace=workspace).select_related("state", "project").first()
    if issue is None:
        return "(Issue not found.)"

    lines = [
        f"Issue {issue.project.identifier}-{issue.sequence_id}: {issue.name}",
        f"id: {issue.id}",
        f"project_id: {issue.project_id}",
        f"description: {(issue.description_stripped or '')[:2000]}",
        f"state: {issue.state.name if issue.state else 'None'} (state_id: {issue.state_id})",
        f"priority: {issue.priority}",
        f"target_date: {issue.target_date}",
    ]

    assignee_names = [
        n for n in IssueAssignee.objects.filter(issue_id=issue.id).values_list("assignee__display_name", flat=True) if n
    ]
    lines.append(f"assignees: {', '.join(assignee_names) or 'none'}")

    label_rows = list(IssueLabel.objects.filter(issue_id=issue.id).values_list("label_id", "label__name"))
    lines.append(
        f"labels: {', '.join(name for _id, name in label_rows) or 'none'}"
        f" (label_ids: {[str(i) for i, _n in label_rows]})"
    )

    cycle_row = CycleIssue.objects.filter(issue_id=issue.id).select_related("cycle").first()
    if cycle_row and can_user_access_object(user, workspace, "cycle", cycle_row.cycle_id):
        lines.append(f"cycle: {cycle_row.cycle.name} (id: {cycle_row.cycle_id})")

    module_rows = ModuleIssue.objects.filter(issue_id=issue.id).select_related("module")[:CONTEXT_LIST_LIMIT]
    visible_modules = [
        f"{mr.module.name} (id: {mr.module_id})"
        for mr in module_rows
        if can_user_access_object(user, workspace, "module", mr.module_id)
    ]
    if visible_modules:
        lines.append(f"modules: {', '.join(visible_modules)}")

    # Related issues - exigence 3's own explicit example. An inaccessible
    # linked issue (a different project the user isn't a member of) is
    # silently dropped here, never included, even though the relation row
    # itself is visible on the accessible primary issue.
    related_rows = (
        IssueRelation.objects.filter(issue_id=issue.id)
        .select_related("related_issue")
        .order_by("-created_at")[: CONTEXT_LIST_LIMIT * 2]
    )
    related_lines = []
    for rel in related_rows:
        related = rel.related_issue
        if related is None or not can_user_access_object(user, workspace, "issue", related.id):
            continue
        related_lines.append(f"{rel.relation_type}: {related.name} (id: {related.id})")
        if len(related_lines) >= CONTEXT_LIST_LIMIT:
            break
    if related_lines:
        lines.append("related issues: " + "; ".join(related_lines))

    recent_comments = [
        c
        for c in issue.issue_comments.order_by("-created_at").values_list("comment_stripped", flat=True)[:5]
        if c
    ]
    if recent_comments:
        lines.append("recent comments: " + " | ".join(c[:300] for c in recent_comments))

    return "\n".join(lines)


def _build_cycle_context(user, workspace, cycle_id) -> str:
    from plane.db.models import Cycle, CycleIssue

    cycle = Cycle.objects.filter(id=cycle_id, workspace=workspace).select_related("project").first()
    if cycle is None:
        return "(Cycle not found.)"

    lines = [
        f"Cycle: {cycle.name}",
        f"id: {cycle.id}",
        f"project_id: {cycle.project_id}",
        f"description: {(cycle.description or '')[:1000]}",
        f"start_date: {cycle.start_date}",
        f"end_date: {cycle.end_date}",
    ]
    issue_rows = (
        CycleIssue.objects.filter(cycle_id=cycle.id).select_related("issue", "issue__state")[:CONTEXT_LIST_LIMIT]
    )
    issue_lines = [
        f"{ir.issue.name} (id: {ir.issue_id}, state: {ir.issue.state.name if ir.issue.state else 'None'})"
        for ir in issue_rows
        if ir.issue is not None
    ]
    if issue_lines:
        lines.append("issues: " + "; ".join(issue_lines))
    return "\n".join(lines)


def _build_module_context(user, workspace, module_id) -> str:
    from plane.db.models import Module, ModuleIssue

    module = Module.objects.filter(id=module_id, workspace=workspace).select_related("project").first()
    if module is None:
        return "(Module not found.)"

    lines = [
        f"Module: {module.name}",
        f"id: {module.id}",
        f"project_id: {module.project_id}",
        f"description: {(module.description or '')[:1000]}",
        f"status: {module.status}",
        f"target_date: {module.target_date}",
    ]
    issue_rows = (
        ModuleIssue.objects.filter(module_id=module.id).select_related("issue", "issue__state")[:CONTEXT_LIST_LIMIT]
    )
    issue_lines = [
        f"{ir.issue.name} (id: {ir.issue_id}, state: {ir.issue.state.name if ir.issue.state else 'None'})"
        for ir in issue_rows
        if ir.issue is not None
    ]
    if issue_lines:
        lines.append("issues: " + "; ".join(issue_lines))
    return "\n".join(lines)


def _build_project_context(user, workspace, project_id) -> str:
    from plane.db.models import Issue, Project

    project = Project.objects.filter(id=project_id, workspace=workspace).first()
    if project is None:
        return "(Project not found.)"

    lines = [
        f"Project: {project.name}",
        f"id: {project.id}",
        f"description: {(project.description or '')[:1000]}",
    ]
    issue_rows = (
        Issue.issue_objects.filter(project_id=project.id)
        .select_related("state")
        .order_by("-created_at")[:CONTEXT_LIST_LIMIT]
    )
    issue_lines = [f"{i.name} (id: {i.id}, state: {i.state.name if i.state else 'None'})" for i in issue_rows]
    if issue_lines:
        lines.append("recent issues: " + "; ".join(issue_lines))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompting
# ---------------------------------------------------------------------------


def build_system_prompt(mode: str, context_str: str) -> str:
    lines = [
        "You are the Plane AI Assistant, an in-app help assistant for the Plane project management tool.",
        "Answer using only the CONTEXT below - never invent issue/cycle/module/page ids or facts not present in it.",
        "",
        "CONTEXT:",
        context_str or "(no additional context)",
        "",
    ]
    if mode == "propose":
        lines += [
            "You are in PROPOSE mode. You may suggest structured changes in addition to your normal text answer.",
            "To propose changes, end your reply with a fenced code block exactly like this:",
            "```json_proposals",
            '[{"target_model": "issue", "target_object_id": "<uuid from CONTEXT>", '
            '"field_name": "state", "proposed_value": "<value>"}]',
            "```",
            "Only reference objects that appear in CONTEXT above, using their real ids - never fabricate an id.",
            "Supported field_name per target_model: issue -> state, assignees, labels, target_date, priority; "
            "cycle -> name, description, end_date; module -> name, description, target_date; page -> name.",
            "'assignees' and 'labels' proposed_value must be a JSON list of ids. Omit the code block entirely if "
            "you have nothing to propose.",
        ]
    else:
        lines.append("You are in ASK mode - read-only. Never claim to have made any change.")
    return "\n".join(lines)


def _approx_token_count(text: Optional[str]) -> int:
    """Rough, provider-agnostic estimate (~4 chars/token) - `call_llm`
    does not currently surface real provider usage figures. Documented as
    approximate on the model field itself."""
    if not text:
        return 0
    return max(len(text) // 4, 1)


# ---------------------------------------------------------------------------
# Reply generation (see module docstring for the sync-vs-task decision)
# ---------------------------------------------------------------------------


def generate_assistant_reply(conversation, user_message, assistant_message):
    """Mutates and saves `assistant_message` in place. Never raises -
    any failure is captured onto the message as `status=failed` +
    `error_message`, matching this codebase's established convention for
    every other AI-adjacent generation pipeline."""
    from plane.db.models import AIMessageStatus

    assistant_message.status = AIMessageStatus.STREAMING
    assistant_message.save(update_fields=["status", "updated_at"])

    system_prompt = ""
    history: List[Dict[str, Any]] = []
    text: Optional[str] = None
    error: Optional[str] = None

    try:
        context_str = build_conversation_context(conversation.created_by, conversation)
        system_prompt = build_system_prompt(user_message.mode, context_str)

        history = list(
            conversation.messages.exclude(id=assistant_message.id)
            .order_by("created_at")
            .values("role", "content")
        )
        messages = [{"role": "system", "content": system_prompt}]
        messages += [
            {"role": m["role"], "content": m["content"]} for m in history if m["role"] in ("user", "assistant")
        ]

        text, error = get_workspace_llm_chat_response(conversation.workspace, messages)
    except Exception as e:
        log_exception(e)
        text, error = None, "Unexpected error while generating the assistant's reply."

    if error or not text:
        assistant_message.status = AIMessageStatus.FAILED
        assistant_message.error_message = error or "No response from the LLM provider."
        assistant_message.save(update_fields=["status", "error_message", "updated_at"])
        return assistant_message

    assistant_message.content = text
    assistant_message.token_count_input = _approx_token_count(system_prompt) + sum(
        _approx_token_count(m["content"]) for m in history
    )
    assistant_message.token_count_output = _approx_token_count(text)
    assistant_message.status = AIMessageStatus.COMPLETED
    assistant_message.save(
        update_fields=["content", "token_count_input", "token_count_output", "status", "updated_at"]
    )

    if user_message.mode == "propose":
        raw_items = parse_proposed_changes(text)
        if raw_items:
            create_proposals_from_llm_response(assistant_message, conversation, raw_items)

    return assistant_message


def parse_proposed_changes(text: str) -> List[dict]:
    """Structured-JSON approach (same shape as feature 4's citations) -
    never parses free text. Returns `[]` on anything malformed, never
    raises."""
    if not text:
        return []
    match = _PROPOSAL_BLOCK_RE.search(text)
    candidate = match.group(1) if match else None
    if candidate is None:
        start, end = text.find("["), text.rfind("]")
        if start == -1 or end == -1 or end <= start:
            return []
        candidate = text[start : end + 1]
    try:
        parsed = json.loads(candidate)
    except (ValueError, TypeError):
        return []
    return parsed if isinstance(parsed, list) else []


# ---------------------------------------------------------------------------
# Proposal validation/creation
# ---------------------------------------------------------------------------


def _parse_iso_date(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _validate_issue_field(issue, field_name, proposed_value):
    """Returns (is_valid, normalized_value, previous_value, error)."""
    from plane.db.models import IssueAssignee, IssueLabel, Label, ProjectMember, State

    if field_name == "state":
        state = State.objects.filter(id=proposed_value, project_id=issue.project_id).first()
        if state is None:
            return False, None, None, "Invalid state id for this project."
        previous = str(issue.state_id) if issue.state_id else None
        return True, str(state.id), previous, None

    if field_name == "assignees":
        if not isinstance(proposed_value, list) or not proposed_value:
            return False, None, None, "'assignees' must be a non-empty list of user ids."
        valid_ids = {
            str(x)
            for x in ProjectMember.objects.filter(
                project_id=issue.project_id, member_id__in=proposed_value, is_active=True
            ).values_list("member_id", flat=True)
        }
        normalized = [v for v in proposed_value if str(v) in valid_ids]
        if not normalized:
            return False, None, None, "No valid assignees among the proposed ids."
        previous_ids = IssueAssignee.objects.filter(issue_id=issue.id).values_list("assignee_id", flat=True)
        previous = [str(x) for x in previous_ids]
        return True, normalized, previous, None

    if field_name == "labels":
        if not isinstance(proposed_value, list) or not proposed_value:
            return False, None, None, "'labels' must be a non-empty list of label ids."
        valid_label_ids = Label.objects.filter(project_id=issue.project_id, id__in=proposed_value).values_list(
            "id", flat=True
        )
        valid_ids = {str(x) for x in valid_label_ids}
        normalized = [v for v in proposed_value if str(v) in valid_ids]
        if not normalized:
            return False, None, None, "No valid labels among the proposed ids."
        previous = [str(x) for x in IssueLabel.objects.filter(issue_id=issue.id).values_list("label_id", flat=True)]
        return True, normalized, previous, None

    if field_name == "target_date":
        parsed = _parse_iso_date(proposed_value)
        if parsed is None:
            return False, None, None, "'target_date' must be an ISO date (YYYY-MM-DD)."
        previous = issue.target_date.isoformat() if issue.target_date else None
        return True, parsed.isoformat(), previous, None

    if field_name == "priority":
        valid_priorities = {"urgent", "high", "medium", "low", "none"}
        if proposed_value not in valid_priorities:
            return False, None, None, "Invalid priority value."
        return True, proposed_value, issue.priority, None

    return False, None, None, f"Unsupported field '{field_name}' for issue proposals."


def _validate_cycle_field(cycle, field_name, proposed_value):
    if field_name == "name":
        if not isinstance(proposed_value, str) or not proposed_value.strip():
            return False, None, None, "'name' must be a non-empty string."
        return True, proposed_value.strip()[:255], cycle.name, None
    if field_name == "description":
        if not isinstance(proposed_value, str):
            return False, None, None, "'description' must be a string."
        return True, proposed_value, cycle.description, None
    if field_name == "end_date":
        parsed = _parse_iso_date(proposed_value)
        if parsed is None:
            return False, None, None, "'end_date' must be an ISO date (YYYY-MM-DD)."
        previous = cycle.end_date.date().isoformat() if cycle.end_date else None
        return True, parsed.isoformat(), previous, None
    return False, None, None, f"Unsupported field '{field_name}' for cycle proposals."


def _validate_module_field(module, field_name, proposed_value):
    if field_name == "name":
        if not isinstance(proposed_value, str) or not proposed_value.strip():
            return False, None, None, "'name' must be a non-empty string."
        return True, proposed_value.strip()[:255], module.name, None
    if field_name == "description":
        if not isinstance(proposed_value, str):
            return False, None, None, "'description' must be a string."
        return True, proposed_value, module.description, None
    if field_name == "target_date":
        parsed = _parse_iso_date(proposed_value)
        if parsed is None:
            return False, None, None, "'target_date' must be an ISO date (YYYY-MM-DD)."
        previous = module.target_date.isoformat() if module.target_date else None
        return True, parsed.isoformat(), previous, None
    return False, None, None, f"Unsupported field '{field_name}' for module proposals."


def _validate_page_field(page, field_name, proposed_value):
    if field_name == "name":
        if not isinstance(proposed_value, str) or not proposed_value.strip():
            return False, None, None, "'name' must be a non-empty string."
        return True, proposed_value.strip()[:255], page.name, None
    return False, None, None, f"Unsupported field '{field_name}' for page proposals."


_VALIDATORS = {
    "issue": _validate_issue_field,
    "cycle": _validate_cycle_field,
    "module": _validate_module_field,
    "page": _validate_page_field,
}


def create_proposals_from_llm_response(message, conversation, raw_items: List[dict]):
    """Validates each atomic item against real target-object
    existence/field validity - a nonsense proposal is never stored, ever
    (per the feature's own explicit requirement). Also re-checks the
    conversation owner's READ access to the target object - a proposal is
    never created against something that was never legitimately part of
    this conversation's own accessible context (exigence 3 extended to
    proposals, not just prompt-building)."""
    from plane.db.models import AIChangeProposal, AIChangeProposalStatus, Cycle, Issue, Module, Page

    workspace = conversation.workspace
    model_by_target = {"issue": Issue, "cycle": Cycle, "module": Module, "page": Page}
    created = []

    for item in raw_items:
        if not isinstance(item, dict):
            continue
        target_model = str(item.get("target_model", "")).strip().lower()
        target_object_id = item.get("target_object_id")
        field_name = str(item.get("field_name", "")).strip().lower()
        proposed_value = item.get("proposed_value")

        if target_model not in model_by_target or not target_object_id or not field_name:
            continue
        try:
            target_object_id = UUID(str(target_object_id))
        except (ValueError, TypeError):
            continue

        obj = model_by_target[target_model].objects.filter(id=target_object_id, workspace=workspace).first()
        if obj is None:
            continue

        if not can_user_access_object(conversation.created_by, workspace, target_model, target_object_id):
            continue

        is_valid, normalized, previous, _error = _VALIDATORS[target_model](obj, field_name, proposed_value)
        if not is_valid:
            continue

        proposal = AIChangeProposal.objects.create(
            message=message,
            workspace=workspace,
            project_id=getattr(obj, "project_id", None),
            target_model=target_model,
            target_object_id=target_object_id,
            field_name=field_name,
            proposed_value=normalized,
            previous_value=previous,
            status=AIChangeProposalStatus.PENDING,
        )
        created.append(proposal)

    return created


# ---------------------------------------------------------------------------
# Applying an approved proposal (exigence 7 - through the SAME serializer/
# bgtask path a manual edit already uses, no parallel mutation path).
# ---------------------------------------------------------------------------


def apply_change_proposal(proposal, approver) -> Tuple[bool, Optional[str]]:
    """Returns `(success, error)`. Never raises - a failure is reported
    back to the caller (the approve endpoint), which leaves the proposal
    in its current status rather than marking it applied."""
    from plane.db.models import Cycle, Module, Page

    try:
        if proposal.target_model == "issue":
            return _apply_issue_proposal(proposal, approver)
        if proposal.target_model == "cycle":
            return _apply_direct_field_proposal(proposal, approver, Cycle, CYCLE_FIELDS)
        if proposal.target_model == "module":
            return _apply_direct_field_proposal(proposal, approver, Module, MODULE_FIELDS)
        if proposal.target_model == "page":
            return _apply_direct_field_proposal(proposal, approver, Page, PAGE_FIELDS)
        return False, f"Unsupported target model '{proposal.target_model}'."
    except Exception as e:
        log_exception(e)
        return False, "Unexpected error while applying the change."


def _apply_issue_proposal(proposal, approver) -> Tuple[bool, Optional[str]]:
    """Reuses `IssueCreateSerializer` (the exact serializer
    `IssueViewSet.partial_update` uses for a manual PATCH) and calls the
    real `issue_activity` task function DIRECTLY (not `.delay()`) so the
    resulting `IssueActivity` is created synchronously, in the same
    request, with `actor=approver`/`is_automation=False` - never the bot.
    Calling the task function directly still executes the identical,
    unduplicated task body; only `.delay()`'s broker round-trip is
    skipped, which also lets this function read back the created
    activity's id for `AIChangeProposal.applied_activity_id` (impossible
    if the row were created asynchronously by a worker after this request
    already returned).
    """
    from django.core.serializers.json import DjangoJSONEncoder

    from plane.app.serializers import IssueCreateSerializer, IssueDetailSerializer
    from plane.bgtasks.issue_activities_task import issue_activity
    from plane.db.models import Issue, IssueActivity

    issue = Issue.objects.filter(id=proposal.target_object_id, workspace_id=proposal.workspace_id).first()
    if issue is None:
        return False, "Target issue no longer exists."

    patch_key = ISSUE_FIELD_TO_PATCH_KEY.get(proposal.field_name)
    if patch_key is None:
        return False, f"Unsupported issue field '{proposal.field_name}'."

    patch_data = {patch_key: proposal.proposed_value}
    current_instance = json.dumps(IssueDetailSerializer(issue).data, cls=DjangoJSONEncoder)

    serializer = IssueCreateSerializer(
        issue, data=patch_data, partial=True, context={"project_id": issue.project_id}
    )
    if not serializer.is_valid():
        return False, json.dumps(serializer.errors)

    serializer.save()

    epoch = int(timezone.now().timestamp())
    issue_activity(
        type="issue.activity.updated",
        requested_data=json.dumps(patch_data, cls=DjangoJSONEncoder),
        actor_id=str(approver.id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        current_instance=current_instance,
        epoch=epoch,
        notification=True,
        origin=None,
        is_automation=False,
    )

    activity = (
        IssueActivity.objects.filter(issue_id=issue.id, actor_id=approver.id).order_by("-created_at").first()
    )
    if activity is not None:
        proposal.applied_activity_id = activity.id

    return True, None


def _apply_direct_field_proposal(proposal, approver, model, allowed_fields) -> Tuple[bool, Optional[str]]:
    """Cycle/Module/Page have no `IssueActivity`-equivalent trail model in
    this codebase (confirmed) - applied directly via the model's own
    field + `save()`, still stamping `updated_by=approver`. No
    `applied_activity_id` is ever set for these (documented gap - see
    `plane.db.models.ai_chat.AIChangeProposal` docstring)."""
    if proposal.field_name not in allowed_fields:
        return False, f"Unsupported field '{proposal.field_name}' for {model.__name__} proposals."

    obj = model.objects.filter(id=proposal.target_object_id, workspace_id=proposal.workspace_id).first()
    if obj is None:
        return False, f"Target {model.__name__.lower()} no longer exists."

    setattr(obj, proposal.field_name, proposal.proposed_value)
    obj.updated_by = approver
    obj.save(update_fields=[proposal.field_name, "updated_by", "updated_at"])
    return True, None


def expire_stale_proposals() -> int:
    """Exigence 8 - Celery beat task entry point
    (`plane.bgtasks.cleanup_task.expire_ai_change_proposals`). Returns the
    number of rows transitioned."""
    from plane.db.models import AIChangeProposal, AIChangeProposalStatus

    return AIChangeProposal.objects.filter(
        status=AIChangeProposalStatus.PENDING, expires_at__lt=timezone.now()
    ).update(status=AIChangeProposalStatus.EXPIRED)
