# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Validation + execution engine for governed multi-state workflows - see
docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernés
multi-états avec approbations", section 4) in plane-selfhost.

PHASE 1 OF 2: this module is a pure-ish (DB reads/writes, no HTTP/request
coupling) engine that phase 2 will call from the real `Issue.state`
mutation paths (unitary update, bulk update, public API) - see this
feature's delivery report for the exact call sites. This phase's own
endpoints (`app/views/workflow_transition/base.py`) are the only current
callers.

RESOLVED AMBIGUITY 1 - `approval_required` interaction with role/member
restriction (exigence 5 vs. 6): the spec's own text describes these as
compounding, not mutually exclusive: a transition can (a) be restricted to
a role/member set at all, AND (b) within that set, require some members to
formally request approval while others can act immediately. This is
modeled as: a `WorkflowTransitionApprover` row with `approval_required=False`
means "this role/member may execute the transition directly, right now,
no approval needed for them specifically". A row with `approval_required=
True` means "this role/member is a valid approver for a request that DOES
need approval" (note: this is *not* the same as "this role/member's own
attempts always require approval" - see below). Per actor, at evaluation
time:
  - No approver rows at all on the transition -> unrestricted, anyone who
    reaches this transition proceeds straight to condition-checking.
  - Actor matches at least one `approval_required=False` row (by exact
    `member_id` or by their current `ProjectMember.role` in this project)
    -> direct execution (skip approval), even if the same actor ALSO
    happens to match an `approval_required=True` row elsewhere on the
    same transition - direct-execution rights win once granted.
  - Actor matches only `approval_required=True` row(s) (and no
    `approval_required=False` row) -> `pending_approval`: they may not
    execute directly, but they themselves may act as an approver for
    someone else's request on this same transition.
  - Actor matches neither kind of row -> `denied`/`ROLE_NOT_ALLOWED`: not
    authorized to touch this transition in any capacity.
This reading treats `approval_required` as a property of *the approver
entry*, not of *the transition as a whole* - the only way "no such thing
as instant approval, everyone must request" naturally falls out of this
model is when a transition's approver rows are *all*
`approval_required=True`, which is exactly the common case the spec's own
user stories describe (a named QA/lead sign-off list, no direct-executor
list configured at all).

RESOLVED AMBIGUITY 2 - "le nombre minimal configuré d'approbations
favorables" (exigence 6): the data model as specified (and as built here,
matching it exactly) has no field anywhere to configure a minimum
approval *count* - only a list of valid approvers. The most literal
non-invented reading compatible with the actual schema is therefore "at
least one approval from a valid approver is sufficient" - `
approve_transition_request` executes the transition on the very first
`APPROVED` decision from a valid approver. A future iteration wanting a
true configurable N-of-M count would need a new field on
`WorkflowTransition` (e.g. `min_approvals`) that does not exist in this
phase's brief and was not added speculatively.

RESOLVED SCOPE NARROWING - `REQUIRED_FIELDS_FILLED`: see
`plane/db/models/workflow_transition.py`'s module docstring - restricted
to a configurable list of standard `Issue` field names, since no custom-
field/issue-property system exists in this codebase to reference.

RESOLVED CHOICE - audit log vs. capability probes: exigence 12 says every
refused "tentative" (attempt) must be logged. The `allowed-transitions`
read-only endpoint (`GET .../issues/:issue_id/allowed-transitions/`) calls
`evaluate_transition` once per `State` in the project on every render of
the state-picker UI, purely to annotate which options are clickable - that
is a capability *probe*, not an attempted transition, and logging one
`WorkflowTransitionAuditLog` row per State per page view would flood the
audit trail with noise no Admin asked to see (exigence 12's own purpose -
"consultable par les Admins du projet" - would become unusable).
`evaluate_transition` therefore takes a `log_audit=True` keyword,
defaulting to on for every real mutation-path/approval-flow caller
(phase 2's call sites, and this phase's own `request-approval` endpoint's
server-side re-validation), and is called with `log_audit=False` only from
the `allowed-transitions` endpoint's per-state loop. The same `log_audit`
flag also gates the best-effort `workflow.transition.blocked` webhook
dispatch on a DENIED outcome, for the identical reason one level up the
stack: an external webhook subscriber would see a "blocked" event fired
once per candidate `State` on every state-picker render if it weren't
gated the same way the audit log is - a probe is not an attempt for
either observability channel, not just the DB-backed one.

RESOLVED CHOICE - webhook firing per event (four events, one boolean - see
`Webhook.workflow_transition`'s own docstring for the "one boolean vs.
four" reasoning): `workflow.transition.blocked`,
`workflow.approval.requested`, and `workflow.approval.decided` fire
unconditionally (best-effort) at their respective lifecycle points, since
none of them has a per-transition "action list" to gate through - a
denied attempt never runs actions, and the approval lifecycle isn't itself
one of the configurable `WorkflowTransitionAction` types. `workflow.
transition.completed`, by contrast, DOES have a corresponding configurable
action type (`WorkflowTransitionAction.action_type == "WEBHOOK"`, per
exigence 9 explicitly listing "déclencher un Webhook" as one of several
opt-in post-transition actions an Admin chooses to add) - so it fires once
per `WEBHOOK` action present on the transition's action list, exactly like
any other action, rather than firing unconditionally on every execution.
A transition with no `WEBHOOK` action configured never fires `.completed`
- this is a deliberate reading of exigence 9's "actions... supportées"
framing, not an oversight.

RESOLVED CHOICE - fail-closed on misconfigured LABEL_PRESENT/LABEL_ABSENT:
if a condition's `config.label_id` is missing/blank, the condition is
treated as NOT satisfied (blocks the transition) rather than vacuously
passing. For a governance feature whose entire purpose is to prevent
premature/unauthorized transitions, silently no-op'ing a misconfigured
guard would be the more dangerous failure mode - this mirrors `IssueSLA`'s
own "safer explicit default over silent fallback" precedent (see
`sla.py`'s `SLAPolicy` docstring) applied to a condition instead of a
matching criterion.
"""

from plane.db.models.state import StateGroup
from plane.utils.exception_logger import log_exception

RESOLVED_STATE_GROUPS = (StateGroup.COMPLETED.value, StateGroup.CANCELLED.value)

# Standard `Issue` fields REQUIRED_FIELDS_FILLED may reference - see this
# module's docstring and workflow_transition.py's module docstring for the
# scope-narrowing rationale. M2M-backed pseudo-fields are mapped to their
# real accessor; everything else is read directly off the Issue instance.
_M2M_FIELD_ACCESSORS = {"assignee_ids": "assignees", "label_ids": "labels"}


# ---------------------------------------------------------------------------
# Role/approver matching
# ---------------------------------------------------------------------------


def _get_actor_role(actor, project_id):
    """Returns the actor's current `ProjectMember.role` in this project, or
    `None` if they're not an active member (or `actor` is None - a system/
    automation-triggered evaluation with no human actor)."""
    if actor is None:
        return None
    from plane.db.models import ProjectMember

    return (
        ProjectMember.objects.filter(project_id=project_id, member_id=actor.id, is_active=True)
        .values_list("role", flat=True)
        .first()
    )


def _approver_row_matches(row, actor, actor_role):
    if row.member_id is not None:
        return actor is not None and row.member.member_id == actor.id
    if row.role is not None:
        return actor_role is not None and actor_role == row.role
    return False


def can_approve_transition(user, transition, project_id):
    """Public helper for the approve/reject endpoints - only a `user`
    matching one of `transition`'s `approval_required=True` approver rows
    may approve/reject a pending request for it. See RESOLVED AMBIGUITY 1
    above: `approval_required=False` rows grant direct-execution rights,
    not approval rights."""
    actor_role = _get_actor_role(user, project_id)
    return any(
        _approver_row_matches(row, user, actor_role)
        for row in transition.approvers.filter(approval_required=True).select_related("member")
    )


# ---------------------------------------------------------------------------
# Conditions (exigence 8)
# ---------------------------------------------------------------------------


def _sub_issues_closed(issue):
    from plane.db.models import Issue

    return not (
        Issue.issue_objects.filter(parent_id=issue.id).exclude(state__group__in=RESOLVED_STATE_GROUPS).exists()
    )


def _required_fields_filled(issue, field_names):
    for field_name in field_names or []:
        accessor = _M2M_FIELD_ACCESSORS.get(field_name)
        if accessor is not None:
            if not getattr(issue, accessor).exists():
                return False
        elif field_name == "description_html":
            # `description_stripped` is already maintained by `Issue.save()`
            # for exactly this "is there real content" question - avoids
            # treating the default empty `<p></p>` as "filled".
            if not issue.description_stripped:
                return False
        else:
            value = getattr(issue, field_name, None)
            if value in (None, "", []):
                return False
    return True


def _no_unresolved_blockers(issue):
    """See point 3 of this feature's grounding notes: `IssueBlocker` is
    dead, `IssueRelation` is the real model. A `blocked_by` relation is
    resolved once the blocking issue's own state has reached a
    completed/cancelled group."""
    from plane.db.models import IssueRelation

    blockers = IssueRelation.objects.filter(issue_id=issue.id, relation_type="blocked_by").select_related(
        "related_issue__state"
    )
    for relation in blockers:
        related = relation.related_issue
        group = related.state.group if related.state_id else None
        if group not in RESOLVED_STATE_GROUPS:
            return False
    return True


def _label_present(issue, label_id):
    if not label_id:
        return False  # see module docstring's fail-closed rationale
    return issue.labels.filter(id=label_id).exists()


def _label_absent(issue, label_id):
    if not label_id:
        return False
    return not issue.labels.filter(id=label_id).exists()


def _check_conditions(transition, issue):
    """AND-combined - returns `(True, None)` if every condition passes, or
    `(False, condition_type)` naming the first one that failed."""
    for condition in transition.conditions.all():
        cfg = condition.config or {}
        if condition.condition_type == "SUB_ISSUES_CLOSED":
            ok = _sub_issues_closed(issue)
        elif condition.condition_type == "REQUIRED_FIELDS_FILLED":
            ok = _required_fields_filled(issue, cfg.get("field_names"))
        elif condition.condition_type == "NO_UNRESOLVED_BLOCKERS":
            ok = _no_unresolved_blockers(issue)
        elif condition.condition_type == "LABEL_PRESENT":
            ok = _label_present(issue, cfg.get("label_id"))
        elif condition.condition_type == "LABEL_ABSENT":
            ok = _label_absent(issue, cfg.get("label_id"))
        else:
            # Unknown/future condition_type - fail closed, same rationale
            # as the label-config fallback above.
            ok = False
        if not ok:
            return False, condition.condition_type
    return True, None


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


def _write_audit_log(issue, transition, actor, from_state_id, to_state_id, outcome, denial_reason=None):
    from plane.db.models import WorkflowTransitionAuditLog

    try:
        WorkflowTransitionAuditLog.objects.create(
            issue=issue,
            transition=transition,
            actor=actor,
            from_state_id=from_state_id,
            to_state_id=to_state_id,
            outcome=outcome,
            denial_reason=denial_reason,
        )
    except Exception as e:  # pragma: no cover - defensive, mirrors sla_engine's own style
        log_exception(e, warning=True)


# ---------------------------------------------------------------------------
# Webhooks (best-effort - see module docstring's "one boolean vs four
# events" resolution)
# ---------------------------------------------------------------------------


def _dispatch_workflow_transition_webhook(verb, transition, issue, actor, extra=None):
    try:
        from plane.bgtasks.webhook_task import webhook_activity

        from_state_id = None
        if transition is not None and transition.from_state_id:
            from_state_id = str(transition.from_state_id)
        event_data = {
            "transition_id": str(transition.id) if transition is not None else None,
            "issue_id": str(issue.id),
            "from_state_id": from_state_id,
            "to_state_id": str(transition.to_state_id) if transition is not None else None,
        }
        if extra:
            event_data.update(extra)

        webhook_activity.delay(
            event="workflow_transition",
            verb=verb,
            field=None,
            old_value=None,
            new_value=None,
            actor_id=str(actor.id) if actor is not None else None,
            slug=issue.project.workspace.slug,
            current_site=None,
            event_id=str(transition.id) if transition is not None else str(issue.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override=event_data,
        )
    except Exception as e:
        log_exception(e, warning=True)


# ---------------------------------------------------------------------------
# evaluate_transition - the core entry point
# ---------------------------------------------------------------------------


def evaluate_transition(issue, to_state, actor, log_audit=True):
    """
    Evaluates whether `actor` may move `issue` to `to_state` right now.
    Returns a dict:
      {"outcome": "allowed" | "denied" | "pending_approval",
       "reason": {"code": "...", "message": "..."} | None,
       "transition": WorkflowTransition instance | None}

    `transition` is the matched rule (or `None` for the open-graph case -
    zero rules configured for this (project, issue_type) pair at all).
    See this module's docstring for the full resolved-ambiguity reasoning
    behind steps 4 (approver matching) and the `log_audit` flag.
    """
    from django.db.models import Q

    from plane.db.models import WorkflowTransition

    project_id = issue.project_id
    issue_type_id = issue.type_id
    from_state_id = issue.state_id
    to_state_id = to_state.id if to_state is not None else None

    # Step 2 (exigence 2/3): is the graph open for this (project, type)?
    # Existence alone matters here, regardless of is_active - deactivating
    # every rule for a pair freezes it closed rather than silently
    # reopening it (exigence 17's "sans suppression... conserver
    # l'historique" implies a deactivated rule still counts as "defined").
    type_filter = Q(issue_type__isnull=True)
    if issue_type_id is not None:
        type_filter |= Q(issue_type_id=issue_type_id)
    graph_is_open = not WorkflowTransition.objects.filter(project_id=project_id).filter(type_filter).exists()

    if graph_is_open:
        if log_audit:
            _write_audit_log(issue, None, actor, from_state_id, to_state_id, "ALLOWED")
        return {"outcome": "allowed", "reason": None, "transition": None}

    # Step 3: exact match among ACTIVE rows only. Type-specific rows take
    # precedence over the "applies to all types" (issue_type=None)
    # fallback - exigence 1's "pour chaque IssueType (ou pour 'tous les
    # types' si aucune règle spécifique n'existe)" reads as "specific
    # beats generic when both exist for the same from/to pair".
    transition = None
    if issue_type_id is not None:
        transition = (
            WorkflowTransition.objects.filter(
                project_id=project_id,
                issue_type_id=issue_type_id,
                from_state_id=from_state_id,
                to_state_id=to_state_id,
                is_active=True,
            )
            .select_related("from_state", "to_state")
            .first()
        )
    if transition is None:
        transition = (
            WorkflowTransition.objects.filter(
                project_id=project_id,
                issue_type__isnull=True,
                from_state_id=from_state_id,
                to_state_id=to_state_id,
                is_active=True,
            )
            .select_related("from_state", "to_state")
            .first()
        )

    if transition is None:
        reason = {
            "code": "TRANSITION_NOT_IN_GRAPH",
            "message": "This transition is not part of the configured workflow for this issue type.",
        }
        if log_audit:
            _write_audit_log(
                issue, None, actor, from_state_id, to_state_id, "DENIED", denial_reason=reason["message"]
            )
            _dispatch_workflow_transition_webhook(
                "blocked", None, issue, actor, extra={"reason_code": reason["code"]}
            )
        return {"outcome": "denied", "reason": reason, "transition": None}

    # Step 4: approver/role restriction - see RESOLVED AMBIGUITY 1.
    approvers = list(transition.approvers.select_related("member").all())
    needs_approval = False
    if approvers:
        actor_role = _get_actor_role(actor, project_id)
        matches_direct = any(
            _approver_row_matches(row, actor, actor_role) for row in approvers if not row.approval_required
        )
        matches_approval_only = any(
            _approver_row_matches(row, actor, actor_role) for row in approvers if row.approval_required
        )
        if not matches_direct and not matches_approval_only:
            reason = {
                "code": "ROLE_NOT_ALLOWED",
                "message": "You are not authorized to perform or request this transition.",
            }
            if log_audit:
                _write_audit_log(
                    issue, transition, actor, from_state_id, to_state_id, "DENIED", denial_reason=reason["message"]
                )
                _dispatch_workflow_transition_webhook(
                    "blocked", transition, issue, actor, extra={"reason_code": reason["code"]}
                )
            return {"outcome": "denied", "reason": reason, "transition": transition}
        needs_approval = matches_approval_only and not matches_direct

    # Step 5 (exigence 8): AND-combined preconditions.
    conditions_ok, failed_condition_type = _check_conditions(transition, issue)
    if not conditions_ok:
        reason = {
            "code": "CONDITION_NOT_MET",
            "message": f"Precondition '{failed_condition_type}' is not met.",
        }
        if log_audit:
            _write_audit_log(
                issue, transition, actor, from_state_id, to_state_id, "DENIED", denial_reason=reason["message"]
            )
            _dispatch_workflow_transition_webhook(
                "blocked", transition, issue, actor, extra={"reason_code": reason["code"]}
            )
        return {"outcome": "denied", "reason": reason, "transition": transition}

    if needs_approval:
        if log_audit:
            _write_audit_log(issue, transition, actor, from_state_id, to_state_id, "PENDING_APPROVAL")
        return {"outcome": "pending_approval", "reason": None, "transition": transition}

    if log_audit:
        _write_audit_log(issue, transition, actor, from_state_id, to_state_id, "ALLOWED")
    return {"outcome": "allowed", "reason": None, "transition": transition}


# ---------------------------------------------------------------------------
# execute_allowed_transition - actions + webhook, called only after an
# "allowed" outcome (open-graph or closed-graph-with-match alike).
# ---------------------------------------------------------------------------


def _resolve_template(template, issue, actor):
    """Mirrors plane/utils/workflow_rule_engine.py::_resolve_template
    exactly - same simple string-replace token vocabulary, not a
    templating engine, per the feature spec."""
    identifier = f"{issue.project.identifier}-{issue.sequence_id}"
    actor_name = actor.display_name if actor is not None else "Automation"
    text = template or ""
    text = text.replace("{{issue.identifier}}", identifier)
    text = text.replace("{{issue.title}}", issue.name or "")
    text = text.replace("{{actor.display_name}}", actor_name or "Automation")
    return text


def _create_system_comment(issue, actor, comment_text):
    """Attributed to `actor` (the person who executed or approved the
    transition) rather than to "the transition's author" - unlike
    WorkflowRule (which fires from many trigger types with frequently no
    single natural human actor, see workflow_rule_engine.py's own
    docstring), a WorkflowTransition execution always has a genuine actor,
    so attributing the resulting system comment to them is both possible
    and more accurate for exigence 13's audit trail. `created_by_automation`
    is still set True so the UI renders it as system-generated, not as if
    the actor personally typed it."""
    from plane.db.models import IssueComment

    comment = IssueComment(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        actor_id=actor.id if actor is not None else None,
        comment_html=f"<p>{comment_text}</p>",
        created_by_automation=True,
    )
    comment.save(created_by_id=actor.id if actor is not None else None, disable_auto_set_user=True)
    return comment


def _notify_users(issue, receiver_ids, title, message, sender, actor, entity_identifier=None):
    from plane.db.models import Notification

    receiver_ids = {rid for rid in receiver_ids if rid is not None}
    if actor is not None:
        receiver_ids.discard(actor.id)
    if not receiver_ids:
        return
    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=issue.workspace_id,
                project_id=issue.project_id,
                entity_identifier=entity_identifier or issue.id,
                entity_name="ISSUE_TRANSITION",
                title=title,
                message=[{"data": message}],
                message_stripped=message,
                sender=sender,
                triggered_by_id=actor.id if actor is not None else None,
                receiver_id=receiver_id,
            )
            for receiver_id in receiver_ids
        ]
    )


def _notify_assignees(issue, transition, actor):
    receiver_ids = set(issue.assignees.values_list("id", flat=True))
    title = f'"{issue.name}" moved to {transition.to_state.name}'
    message = f"This issue transitioned to {transition.to_state.name}."
    _notify_users(issue, receiver_ids, title, message, f"in_app:workflow_transition:{transition.id}", actor)


def _notify_watchers(issue, transition, actor):
    from plane.db.models import IssueSubscriber

    receiver_ids = set(IssueSubscriber.objects.filter(issue_id=issue.id).values_list("subscriber_id", flat=True))
    title = f'"{issue.name}" moved to {transition.to_state.name}'
    message = f"An issue you're watching transitioned to {transition.to_state.name}."
    _notify_users(issue, receiver_ids, title, message, f"in_app:workflow_transition:{transition.id}", actor)


def _add_label(issue, label_id):
    from plane.db.models import IssueLabel, Label

    if not label_id or not Label.objects.filter(id=label_id, project_id=issue.project_id).exists():
        raise ValueError(f"label {label_id} not found in this project")
    if IssueLabel.objects.filter(issue_id=issue.id, label_id=label_id).exists():
        return "label already present"
    IssueLabel.objects.create(
        issue_id=issue.id, label_id=label_id, project_id=issue.project_id, workspace_id=issue.workspace_id
    )
    return f"label {label_id} added"


def _remove_label(issue, label_id):
    from plane.db.models import IssueLabel

    deleted, _ = IssueLabel.objects.filter(issue_id=issue.id, label_id=label_id).delete()
    return f"label {label_id} removed" if deleted else "label was not present"


def _assign_member(issue, member_id):
    from plane.db.models import IssueAssignee, ProjectMember

    if not member_id or not ProjectMember.objects.filter(
        project_id=issue.project_id, member_id=member_id, is_active=True
    ).exists():
        raise ValueError(f"user {member_id} is not an active member of this project")
    if IssueAssignee.objects.filter(issue_id=issue.id, assignee_id=member_id).exists():
        return "already assigned"
    IssueAssignee.objects.create(
        issue_id=issue.id, assignee_id=member_id, project_id=issue.project_id, workspace_id=issue.workspace_id
    )
    return f"assigned {member_id}"


def _apply_single_transition_action(action, issue, actor, transition):
    cfg = action.config or {}

    if action.action_type == "WEBHOOK":
        # See module docstring - this is the one event gated on an
        # explicit action row rather than firing unconditionally.
        _dispatch_workflow_transition_webhook("completed", transition, issue, actor)
        return "webhook dispatched"

    if action.action_type == "SYSTEM_COMMENT":
        text = _resolve_template(cfg.get("comment_template", ""), issue, actor)
        comment = _create_system_comment(issue, actor, text)
        return f"comment {comment.id} posted"

    if action.action_type == "NOTIFY_ASSIGNEE":
        _notify_assignees(issue, transition, actor)
        return "assignees notified"

    if action.action_type == "NOTIFY_WATCHERS":
        _notify_watchers(issue, transition, actor)
        return "watchers notified"

    if action.action_type == "ADD_LABEL":
        return _add_label(issue, cfg.get("label_id"))

    if action.action_type == "REMOVE_LABEL":
        return _remove_label(issue, cfg.get("label_id"))

    if action.action_type == "ASSIGN_MEMBER":
        return _assign_member(issue, cfg.get("member_id"))

    raise ValueError(f"unknown action_type '{action.action_type}'")


def _execute_transition_actions(transition, issue, actor):
    """Best-effort sequential, mirrors
    plane/utils/workflow_rule_engine.py::_execute_rule_actions exactly:
    one action's failure doesn't abort the rest."""
    actions_applied = []
    for action in transition.actions.all():  # Meta.ordering == ("sort_order",)
        try:
            detail = _apply_single_transition_action(action, issue, actor, transition)
            actions_applied.append(
                {"action_id": str(action.id), "action_type": action.action_type, "status": "applied", "detail": detail}
            )
        except Exception as e:
            log_exception(e)
            actions_applied.append(
                {"action_id": str(action.id), "action_type": action.action_type, "status": "failed", "error": str(e)}
            )
    return actions_applied


def execute_allowed_transition(issue, to_state, actor, transition):
    """
    Called only once `evaluate_transition` has already returned `allowed`
    for this exact (issue, to_state, actor) - does NOT re-validate.
    Mutates `issue.state`, then (if `transition` is not None - i.e. this
    isn't the open-graph backward-compatibility case, which has no rule to
    hang actions off) runs its `WorkflowTransitionAction` rows in
    `sort_order`.

    Does NOT create the `IssueActivity` entry for the state change itself
    - phase 2's caller already does that via the existing
    `issue_activity.delay()` mechanism at the real mutation site (exigence
    13's "continue d'alimenter IssueActivity comme aujourd'hui" refers to
    that existing mechanism, unchanged). Does NOT write a
    `WorkflowTransitionAuditLog` row for the ALLOWED decision either -
    `evaluate_transition` already wrote that when it made the decision
    (see this module's docstring); `approve_transition_request` below
    writes its own separate ALLOWED row for the post-approval execution,
    since that path never calls `evaluate_transition` a second time.
    """
    issue.state = to_state
    issue.save(update_fields=["state"])

    if transition is None:
        return {"actions_applied": []}

    actions_applied = _execute_transition_actions(transition, issue, actor)
    return {"actions_applied": actions_applied}


# ---------------------------------------------------------------------------
# Approval flow
# ---------------------------------------------------------------------------


def _notify_requester(approval_request, decision, approver, comment):
    from plane.db.models import Notification

    if approval_request.requested_by_id is None or approval_request.requested_by_id == approver.id:
        return
    issue = approval_request.issue
    transition = approval_request.transition
    verb = "approved" if decision == "APPROVED" else "rejected"
    title = f'Your request to move "{issue.name}" to {transition.to_state.name} was {verb}'
    message = comment or f"{approver.display_name} {verb} this transition request."
    Notification.objects.create(
        workspace_id=issue.workspace_id,
        project_id=issue.project_id,
        entity_identifier=approval_request.id,
        entity_name="ISSUE_TRANSITION_APPROVAL",
        title=title,
        message=[{"data": message}],
        message_stripped=message,
        sender=f"in_app:workflow_transition_approval:{decision.lower()}",
        triggered_by_id=approver.id,
        receiver_id=approval_request.requested_by_id,
    )


def _notify_eligible_approvers(approval_request):
    from plane.db.models import Notification, ProjectMember

    transition = approval_request.transition
    issue = approval_request.issue

    approver_rows = list(transition.approvers.filter(approval_required=True).select_related("member"))
    receiver_ids = set()
    role_values = set()
    for row in approver_rows:
        if row.member_id is not None:
            receiver_ids.add(row.member.member_id)
        elif row.role is not None:
            role_values.add(row.role)
    if role_values:
        receiver_ids.update(
            ProjectMember.objects.filter(
                project_id=issue.project_id, role__in=role_values, is_active=True
            ).values_list("member_id", flat=True)
        )
    receiver_ids.discard(approval_request.requested_by_id)
    if not receiver_ids:
        return

    requester_name = approval_request.requested_by.display_name if approval_request.requested_by else "Someone"
    title = f'Approval requested for "{issue.name}" -> {transition.to_state.name}'
    message = f"{requester_name} requested approval to move this issue to {transition.to_state.name}."
    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=issue.workspace_id,
                project_id=issue.project_id,
                entity_identifier=approval_request.id,
                entity_name="ISSUE_TRANSITION_APPROVAL",
                title=title,
                message=[{"data": message}],
                message_stripped=message,
                sender="in_app:workflow_transition_approval:requested",
                triggered_by_id=approval_request.requested_by_id,
                receiver_id=receiver_id,
            )
            for receiver_id in receiver_ids
        ]
    )


def create_approval_request(issue, transition, requested_by):
    """Called by the `request-approval` endpoint after it has itself
    re-validated (server-side) that `evaluate_transition` currently
    returns `pending_approval` for this exact (issue, transition.to_state,
    requested_by) - this function does not re-check that, it only
    persists the request and fires the observability/notification
    side-effects (exigence 6's request-creation half)."""
    from plane.db.models import IssueTransitionApprovalRequest

    approval_request = IssueTransitionApprovalRequest.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        transition=transition,
        requested_by=requested_by,
        status="PENDING",
    )
    _dispatch_workflow_transition_webhook("requested", transition, issue, requested_by)
    _notify_eligible_approvers(approval_request)
    return approval_request


def approve_transition_request(approval_request, approver, decision, comment=""):
    """
    Records `approver`'s `decision` ("APPROVED"/"REJECTED") on
    `approval_request`. See RESOLVED AMBIGUITY 2 above: since the data
    model has no configurable minimum-approval-count field, a single
    `APPROVED` decision from a valid approver is sufficient to execute the
    transition immediately. A `REJECTED` decision never executes it and
    notifies the requester (exigence 7); the request would need to be
    re-submitted (a fresh `IssueTransitionApprovalRequest`) to be
    reconsidered, matching exigence 7 literally.

    Caller (the approve/reject endpoint) is responsible for having already
    verified `approver` is a valid approver for `approval_request.
    transition` via `can_approve_transition` and that `approval_request.
    status == "PENDING"`.
    """
    from plane.db.models import IssueTransitionApproval

    approval = IssueTransitionApproval.objects.create(
        approval_request=approval_request, approver=approver, decision=decision, comment=comment or ""
    )
    _dispatch_workflow_transition_webhook(
        "decided", approval_request.transition, approval_request.issue, approver, extra={"decision": decision}
    )

    if decision == "REJECTED":
        approval_request.status = "REJECTED"
        approval_request.save(update_fields=["status"])
        _notify_requester(approval_request, "REJECTED", approver, comment)
        return {"status": "REJECTED", "approval": approval, "issue": approval_request.issue}

    issue = approval_request.issue
    transition = approval_request.transition
    old_state_id = issue.state_id
    execute_allowed_transition(issue, transition.to_state, approver, transition)
    _write_audit_log(issue, transition, approver, old_state_id, transition.to_state_id, "ALLOWED")

    approval_request.status = "APPROVED"
    approval_request.save(update_fields=["status"])
    _notify_requester(approval_request, "APPROVED", approver, comment)
    return {"status": "APPROVED", "approval": approval, "issue": issue}
