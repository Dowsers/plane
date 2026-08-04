# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import time
from datetime import date, timedelta

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.http import QueryDict
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    Label,
    ProjectMember,
    State,
    User,
    WorkflowRule,
    WorkflowRuleExecutionLog,
)
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception
from plane.utils.filters.filterset import IssueFilterSet

# exigence 7 de docs/feature-specs/06-automation-workflow-sla.md ("Moteur de
# regles d'automatisation") in plane-selfhost - loop protection.
MAX_CHAIN_DEPTH = 5
# exigence 13 - max executions/minute per rule, for rule runs triggered by
# bulk operations.
MAX_EXECUTIONS_PER_MINUTE = 50

# Condition field vocabulary - matches IssueFilterSet's declared filters
# exactly (plane/utils/filters/filterset.py) so translation below is a
# direct passthrough.
ALLOWED_CONDITION_FIELDS = {"state_id", "priority", "label_id", "assignee_id", "module_id", "cycle_id"}
# Only these fields have a `<field>__isnull` filter declared on
# IssueFilterSet - "is_empty"/"is_not_empty" are only meaningful for them.
ISNULL_CAPABLE_FIELDS = {"label_id", "assignee_id", "module_id", "cycle_id"}


# ---------------------------------------------------------------------------
# Condition matching - reuses IssueFilterSet.build_combined_q() rather than
# building a new condition-matching engine, see
# plane/utils/filters/filterset.py and plane/utils/filters/filter_backend.py
# ("ComplexFilterBackend._build_leaf_q"), whose leaf-dict -> QueryDict ->
# filterset technique this mirrors directly. The full recursive
# and/or/not node evaluator in ComplexFilterBackend isn't used here: a
# WorkflowRule's conditions are always a flat, AND-combined list (exigence 8),
# and negation ("is_not"/"not_in") is instead handled by inverting the
# boolean result of a small standalone filterset check per condition -
# simpler than forcing negated and non-negated keys into a single shared
# leaf dict.
# ---------------------------------------------------------------------------


def _leaf_matches(leaf_dict, base_qs):
    """Evaluate a single filterset leaf-dict against `base_qs` (already
    scoped to one Issue pk) and return whether it matches."""
    if not leaf_dict:
        return True

    qd = QueryDict(mutable=True)
    for key, value in leaf_dict.items():
        if isinstance(value, (list, tuple)):
            qd.setlist(key, [str(v) for v in value])
        else:
            qd[key] = "" if value is None else str(value)
    qd = qd.copy()
    qd._mutable = False

    fs = IssueFilterSet(data=qd, queryset=base_qs)
    if not fs.is_valid():
        # Malformed/stale condition (e.g. a non-UUID value for state_id) -
        # fail closed rather than raising and aborting the whole evaluation
        # pass for every rule sharing this trigger.
        return False

    combined_q = fs.build_combined_q()
    return base_qs.filter(combined_q).exists()


def _conditions_match(conditions, issue):
    """
    AND-combines all of a rule's conditions - exigence 8 de
    docs/feature-specs/06-automation-workflow-sla.md ("Moteur de regles
    d'automatisation") in plane-selfhost. Each condition is
    `{"field": ..., "operator": ..., "value": ...}`.
    """
    if not conditions:
        return True

    base_qs = Issue.objects.filter(pk=issue.id)
    positive_leaf = {}
    negative_leaves = []

    for condition in conditions:
        if not isinstance(condition, dict):
            continue
        field = condition.get("field")
        operator = condition.get("operator")
        value = condition.get("value")
        if field not in ALLOWED_CONDITION_FIELDS:
            continue

        if operator in ("is", "equals", "eq"):
            positive_leaf[field] = value
        elif operator == "in":
            positive_leaf[f"{field}__in"] = value
        elif operator == "is_empty" and field in ISNULL_CAPABLE_FIELDS:
            positive_leaf[f"{field}__isnull"] = True
        elif operator == "is_not_empty" and field in ISNULL_CAPABLE_FIELDS:
            positive_leaf[f"{field}__isnull"] = False
        elif operator in ("is_not", "not_equals", "ne"):
            negative_leaves.append({field: value})
        elif operator == "not_in":
            negative_leaves.append({f"{field}__in": value})
        # Any other/unsupported field+operator combination is ignored
        # defensively rather than raising - one malformed condition
        # shouldn't take down evaluation for every rule sharing this trigger.

    if positive_leaf and not _leaf_matches(positive_leaf, base_qs):
        return False

    for neg_leaf in negative_leaves:
        if _leaf_matches(neg_leaf, base_qs):
            return False

    return True


def _trigger_config_matches(trigger_config, trigger_snapshot):
    """
    e.g. STATE_CHANGED's `{"from_state_id": "...", "to_state_id": "..."}` -
    either key alone means "any -> X" or "X -> any"; an empty/absent
    trigger_config always matches (exigence per the WorkflowRule.trigger_config
    docstring in plane/db/models/workflow_rule.py).
    """
    if not trigger_config:
        return True
    for key, expected in trigger_config.items():
        if expected in (None, ""):
            continue
        if str(trigger_snapshot.get(key)) != str(expected):
            return False
    return True


# ---------------------------------------------------------------------------
# Rate limiting - exigence 13. No existing Celery-task-level pattern to
# reuse (only DRF SimpleRateThrottle subclasses gating synchronous HTTP
# views exist elsewhere in this codebase) - this is a small
# Redis-counter-based check, INCR+EXPIRE on a fixed 60s wall-clock window,
# following the same redis_instance() usage style as e.g.
# bgtasks/email_notification_task.py.
# ---------------------------------------------------------------------------


def _check_rate_limit(rule_id):
    """Returns False (caller should skip execution) once a rule has run
    MAX_EXECUTIONS_PER_MINUTE times within the current minute. Fails open
    (allows execution) if Redis is briefly unavailable - a rate limiter
    should never be the reason an automation silently stops firing."""
    try:
        ri = redis_instance()
        key = f"workflow_rule_rate:{rule_id}:{int(time.time() // 60)}"
        count = ri.incr(key)
        if count == 1:
            ri.expire(key, 60)
        return count <= MAX_EXECUTIONS_PER_MINUTE
    except Exception as e:
        log_exception(e, warning=True)
        return True


# ---------------------------------------------------------------------------
# Action application - best-effort sequential (exigence 9): each action is
# wrapped individually so one action's failure doesn't abort the rest of the
# rule's action list.
# ---------------------------------------------------------------------------


def _resolve_template(template, issue, actor):
    """Simple string-replace token resolution, not a templating engine, per
    the feature spec."""
    identifier = f"{issue.project.identifier}-{issue.sequence_id}"
    actor_name = actor.display_name if actor is not None else "Automation"
    text = template or ""
    text = text.replace("{{issue.identifier}}", identifier)
    text = text.replace("{{issue.title}}", issue.name or "")
    text = text.replace("{{actor.display_name}}", actor_name or "Automation")
    return text


def _create_automation_comment(issue, rule, comment_text, mention_user_id=None):
    """
    Creates an IssueComment attributed to the rule's author (see
    IssueComment.created_by_automation and point 4 of the feature's
    grounding notes - no dedicated bot user exists in this codebase).
    `.save(created_by_id=..., disable_auto_set_user=True)` is required
    (rather than plain `.objects.create(...)`) because this runs in a
    Celery task with no request-scoped current user: BaseModel.save()'s
    default path would otherwise fall through to `crum.get_current_user()`
    and null out created_by/updated_by - see plane/db/models/base.py and
    the same `disable_auto_set_user=True` convention used in
    bgtasks/workspace_seed_task.py.
    """
    comment_html = f"<p>{comment_text}</p>"
    if mention_user_id:
        comment_html += (
            f'<mention-component entity_name="user_mention" '
            f'entity_identifier="{mention_user_id}"></mention-component>'
        )

    comment = IssueComment(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        actor_id=rule.created_by_id,
        comment_html=comment_html,
        created_by_automation=True,
        created_by_id=rule.created_by_id,
        updated_by_id=rule.created_by_id,
    )
    comment.save(created_by_id=rule.created_by_id, disable_auto_set_user=True)
    return comment


def _dispatch_field_activity(issue, rule, requested_fields, current_fields):
    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps(requested_fields, cls=DjangoJSONEncoder),
        current_instance=json.dumps(current_fields, cls=DjangoJSONEncoder),
        actor_id=str(rule.created_by_id) if rule.created_by_id else None,
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        epoch=int(timezone.now().timestamp()),
        notification=True,
        is_automation=True,
    )


def _dispatch_comment_activity(issue, rule, comment):
    issue_activity.delay(
        type="comment.activity.created",
        requested_data=json.dumps({"comment_html": comment.comment_html, "id": str(comment.id)}, cls=DjangoJSONEncoder),
        current_instance=None,
        actor_id=str(rule.created_by_id) if rule.created_by_id else None,
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        epoch=int(timezone.now().timestamp()),
        notification=True,
        is_automation=True,
    )


def _apply_single_action(action, issue, rule, actor_id):
    """
    Applies one WorkflowAction to `issue`. Returns a dict describing the
    outcome (with a `resulting_triggers` map of
    `{trigger_type: trigger_snapshot}` this mutation should cascade into -
    see evaluate_rules_for_issue's chain-depth handling) or raises on
    failure - the caller catches this per-action.
    """
    cfg = action.action_config or {}

    if action.action_type == "SET_STATE":
        state_id = cfg.get("state_id")
        state = State.objects.filter(id=state_id, project_id=issue.project_id).first()
        if state is None:
            raise ValueError(f"state {state_id} not found in this project")
        old_state_id = str(issue.state_id) if issue.state_id else None
        if str(state.id) == old_state_id:
            return {"detail": "state unchanged", "resulting_triggers": {}}
        issue.state_id = state.id
        issue.save(update_fields=["state_id"])
        _dispatch_field_activity(issue, rule, {"state_id": str(state.id)}, {"state_id": old_state_id})
        return {
            "detail": f"state -> {state.name}",
            "resulting_triggers": {
                "STATE_CHANGED": {"from_state_id": old_state_id, "to_state_id": str(state.id)},
                "ISSUE_UPDATED": {},
            },
        }

    if action.action_type == "SET_PRIORITY":
        priority = cfg.get("priority")
        if priority not in dict(Issue.PRIORITY_CHOICES):
            raise ValueError(f"invalid priority '{priority}'")
        old_priority = issue.priority
        if priority == old_priority:
            return {"detail": "priority unchanged", "resulting_triggers": {}}
        issue.priority = priority
        issue.save(update_fields=["priority"])
        _dispatch_field_activity(issue, rule, {"priority": priority}, {"priority": old_priority})
        return {
            "detail": f"priority -> {priority}",
            "resulting_triggers": {
                "PRIORITY_CHANGED": {"from_priority": old_priority, "to_priority": priority},
                "ISSUE_UPDATED": {},
            },
        }

    if action.action_type == "SET_ASSIGNEES":
        requested_ids = [str(a) for a in (cfg.get("assignee_ids") or [])]
        mode = cfg.get("mode", "replace")
        valid_ids = {
            str(x)
            for x in ProjectMember.objects.filter(
                member_id__in=requested_ids, project_id=issue.project_id, is_active=True
            ).values_list("member_id", flat=True)
        }
        old_ids = {
            str(x) for x in IssueAssignee.objects.filter(issue_id=issue.id).values_list("assignee_id", flat=True)
        }
        to_remove = (old_ids - valid_ids) if mode == "replace" else set()
        to_add = valid_ids - old_ids

        if not to_remove and not to_add:
            return {"detail": "assignees unchanged", "resulting_triggers": {}}

        if to_remove:
            IssueAssignee.objects.filter(issue_id=issue.id, assignee_id__in=to_remove).delete()
        if to_add:
            IssueAssignee.objects.bulk_create(
                [
                    IssueAssignee(
                        issue_id=issue.id, assignee_id=uid, project_id=issue.project_id, workspace_id=issue.workspace_id
                    )
                    for uid in to_add
                ],
                batch_size=100,
                ignore_conflicts=True,
            )

        new_ids = (old_ids - to_remove) | to_add
        _dispatch_field_activity(issue, rule, {"assignee_ids": sorted(new_ids)}, {"assignee_ids": sorted(old_ids)})
        return {
            "detail": f"assignees -> {sorted(new_ids)}",
            "resulting_triggers": {
                "ASSIGNEE_CHANGED": {
                    "added_assignee_ids": sorted(to_add),
                    "removed_assignee_ids": sorted(to_remove),
                },
                "ISSUE_UPDATED": {},
            },
        }

    if action.action_type in ("ADD_LABELS", "REMOVE_LABELS"):
        requested_ids = [str(x) for x in (cfg.get("label_ids") or [])]
        valid_ids = {
            str(x)
            for x in Label.objects.filter(id__in=requested_ids, project_id=issue.project_id).values_list(
                "id", flat=True
            )
        }
        old_ids = {str(x) for x in IssueLabel.objects.filter(issue_id=issue.id).values_list("label_id", flat=True)}

        if action.action_type == "ADD_LABELS":
            to_add, to_remove = valid_ids - old_ids, set()
        else:
            to_add, to_remove = set(), old_ids & valid_ids

        if not to_add and not to_remove:
            return {"detail": "labels unchanged", "resulting_triggers": {}}

        if to_remove:
            IssueLabel.objects.filter(issue_id=issue.id, label_id__in=to_remove).delete()
        if to_add:
            IssueLabel.objects.bulk_create(
                [
                    IssueLabel(
                        issue_id=issue.id,
                        label_id=lid,
                        project_id=issue.project_id,
                        workspace_id=issue.workspace_id,
                    )
                    for lid in to_add
                ],
                batch_size=100,
                ignore_conflicts=True,
            )

        new_ids = (old_ids - to_remove) | to_add
        _dispatch_field_activity(issue, rule, {"label_ids": sorted(new_ids)}, {"label_ids": sorted(old_ids)})
        resulting_triggers = {"ISSUE_UPDATED": {}}
        if to_add:
            resulting_triggers["LABEL_ADDED"] = {"added_label_ids": sorted(to_add)}
        return {"detail": f"labels -> {sorted(new_ids)}", "resulting_triggers": resulting_triggers}

    if action.action_type in ("SET_DUE_DATE", "SET_START_DATE"):
        field_name = "target_date" if action.action_type == "SET_DUE_DATE" else "start_date"
        mode = cfg.get("mode", "fixed")
        if mode == "relative":
            days = cfg.get("days_from_trigger")
            if days is None:
                raise ValueError("relative mode requires 'days_from_trigger'")
            new_date = (timezone.now() + timedelta(days=int(days))).date()
        else:
            date_str = cfg.get("date")
            if not date_str:
                raise ValueError("fixed mode requires 'date'")
            new_date = date.fromisoformat(date_str)

        old_date = getattr(issue, field_name)
        if old_date == new_date:
            return {"detail": f"{field_name} unchanged", "resulting_triggers": {}}
        setattr(issue, field_name, new_date)
        issue.save(update_fields=[field_name])
        _dispatch_field_activity(
            issue,
            rule,
            {field_name: new_date.isoformat()},
            {field_name: old_date.isoformat() if old_date else None},
        )
        return {"detail": f"{field_name} -> {new_date.isoformat()}", "resulting_triggers": {"ISSUE_UPDATED": {}}}

    if action.action_type in ("POST_COMMENT", "MENTION_USER"):
        mention_user_id = None
        if action.action_type == "MENTION_USER":
            mention_user_id = cfg.get("user_id")
            if not ProjectMember.objects.filter(
                project_id=issue.project_id, member_id=mention_user_id, is_active=True
            ).exists():
                raise ValueError(f"user {mention_user_id} is not an active member of this project")

        actor = User.objects.filter(pk=actor_id).first() if actor_id else None
        text = _resolve_template(cfg.get("comment_template", ""), issue, actor)
        comment = _create_automation_comment(issue, rule, text, mention_user_id=mention_user_id)
        _dispatch_comment_activity(issue, rule, comment)
        return {
            "detail": "comment posted" if action.action_type == "POST_COMMENT" else f"mentioned {mention_user_id}",
            "comment_id": str(comment.id),
            "resulting_triggers": {"COMMENT_ADDED": {"comment_id": str(comment.id)}},
        }

    raise ValueError(f"unknown action_type '{action.action_type}'")


def _execute_rule_actions(rule, issue, actor_id):
    """
    Applies actions in sort_order, best-effort sequential - exigence 9: one
    action's failure doesn't abort the rest, and partial application is
    logged accurately (what succeeded, what didn't) without rolling back
    the ones that succeeded.
    """
    actions_applied = []
    errors = []
    resulting_trigger_types = {}

    for action in rule.actions.all():  # Meta.ordering == ("sort_order",)
        try:
            result = _apply_single_action(action, issue, rule, actor_id)
            entry = {"action_id": str(action.id), "action_type": action.action_type, "status": "applied"}
            if result.get("detail"):
                entry["detail"] = result["detail"]
            if result.get("comment_id"):
                entry["comment_id"] = result["comment_id"]
            actions_applied.append(entry)
            for trigger_type, snapshot in (result.get("resulting_triggers") or {}).items():
                resulting_trigger_types.setdefault(trigger_type, {}).update(snapshot)
        except Exception as e:
            log_exception(e)
            errors.append(f"{action.action_type}: {e}")
            actions_applied.append(
                {"action_id": str(action.id), "action_type": action.action_type, "status": "failed", "error": str(e)}
            )

    return actions_applied, errors, resulting_trigger_types


def _dispatch_workflow_rule_webhook(rule, issue, actions_applied, status):
    """
    New "workflow_rule.triggered" webhook event - see
    plane/db/models/webhook.py's `Webhook.workflow_rule` field and
    bgtasks/webhook_task.py's `event_data_override` param. Best-effort:
    failures here must never affect rule execution/logging.
    """
    try:
        from plane.bgtasks.webhook_task import webhook_activity

        webhook_activity.delay(
            event="workflow_rule",
            verb="triggered",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=str(rule.created_by_id) if rule.created_by_id else None,
            slug=issue.project.workspace.slug,
            current_site=None,
            event_id=str(rule.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={
                "rule_id": str(rule.id),
                "issue_id": str(issue.id),
                "actions_applied": actions_applied,
                "status": status,
            },
        )
    except Exception as e:
        log_exception(e, warning=True)


def evaluate_rules_for_issue(issue_id, trigger_type, trigger_snapshot=None, actor_id=None, chain_depth=0):
    """
    Evaluates every active WorkflowRule for `issue`'s project matching
    `trigger_type`, sequentially by creation order - exigence 8 (one rule's
    failure doesn't block the next). Every rule run's outcome
    (matched-and-executed, condition-not-met, chain-depth-exceeded, rate-
    limited, error) gets exactly one WorkflowRuleExecutionLog row -
    exigence 9.

    Chain-depth loop protection (exigence 7): actions that mutate the issue
    can themselves constitute a new trigger event (e.g. a SET_STATE action
    firing under an ISSUE_UPDATED-triggered rule also constitutes a
    STATE_CHANGED event). Rather than relying on the generic
    bgtasks/issue_activities_task.py hook to notice its own automation-
    generated activity and re-dispatch (which would incorrectly reset
    chain_depth to 0 every time, since that hook has no visibility into
    "this activity came from a cascade"), this function itself aggregates
    every resulting trigger type produced by every rule it successfully
    executed in this pass, and re-dispatches itself directly with
    chain_depth + 1 - see the bottom of this function. A rule run at
    chain_depth >= MAX_CHAIN_DEPTH is logged SKIPPED and executes no
    actions, so it produces no resulting triggers and the recursion
    terminates on its own - no separate depth check is needed before the
    recursive dispatch.
    """
    trigger_snapshot = trigger_snapshot or {}
    issue = Issue.objects.filter(pk=issue_id).select_related("project", "project__workspace").first()
    if issue is None:
        return

    rules = (
        WorkflowRule.objects.filter(project_id=issue.project_id, trigger_type=trigger_type, is_active=True)
        .order_by("created_at")
        .prefetch_related("actions")
    )

    aggregated_resulting_triggers = {}
    cascade_actor_id = actor_id

    for rule in rules:
        if chain_depth >= MAX_CHAIN_DEPTH:
            WorkflowRuleExecutionLog.objects.create(
                rule=rule,
                issue=issue,
                trigger_event=trigger_type,
                status="SKIPPED",
                actions_applied=[],
                error_message="chain_depth_exceeded",
                chain_depth=chain_depth,
            )
            continue

        if not _trigger_config_matches(rule.trigger_config, trigger_snapshot):
            WorkflowRuleExecutionLog.objects.create(
                rule=rule,
                issue=issue,
                trigger_event=trigger_type,
                status="SKIPPED",
                actions_applied=[],
                error_message="trigger_config_not_matched",
                chain_depth=chain_depth,
            )
            continue

        try:
            conditions_ok = _conditions_match(rule.conditions, issue)
        except Exception as e:
            log_exception(e)
            WorkflowRuleExecutionLog.objects.create(
                rule=rule,
                issue=issue,
                trigger_event=trigger_type,
                status="FAILED",
                actions_applied=[],
                error_message=f"condition_evaluation_error: {e}",
                chain_depth=chain_depth,
            )
            continue

        if not conditions_ok:
            WorkflowRuleExecutionLog.objects.create(
                rule=rule,
                issue=issue,
                trigger_event=trigger_type,
                status="SKIPPED",
                actions_applied=[],
                error_message="conditions_not_matched",
                chain_depth=chain_depth,
            )
            continue

        if not _check_rate_limit(rule.id):
            WorkflowRuleExecutionLog.objects.create(
                rule=rule,
                issue=issue,
                trigger_event=trigger_type,
                status="SKIPPED",
                actions_applied=[],
                error_message="rate_limit_exceeded",
                chain_depth=chain_depth,
            )
            continue

        actions_applied, errors, resulting_triggers = _execute_rule_actions(rule, issue, actor_id)
        run_status = "FAILED" if errors else "SUCCESS"

        WorkflowRuleExecutionLog.objects.create(
            rule=rule,
            issue=issue,
            trigger_event=trigger_type,
            status=run_status,
            actions_applied=actions_applied,
            error_message="; ".join(errors) if errors else None,
            chain_depth=chain_depth,
        )

        WorkflowRule.objects.filter(pk=rule.id).update(
            execution_count=models.F("execution_count") + 1, last_triggered_at=timezone.now()
        )

        _dispatch_workflow_rule_webhook(rule, issue, actions_applied, run_status)

        if resulting_triggers:
            # The actor of any cascaded trigger is the automation itself,
            # attributed to the rule that just ran - see point 4 of this
            # feature's grounding notes (no dedicated bot user exists).
            cascade_actor_id = rule.created_by_id
            for trigger_type_out, snapshot in resulting_triggers.items():
                aggregated_resulting_triggers.setdefault(trigger_type_out, {}).update(snapshot)

    if aggregated_resulting_triggers:
        from plane.bgtasks.workflow_rule_task import evaluate_workflow_rules

        for trigger_type_out, snapshot in aggregated_resulting_triggers.items():
            evaluate_workflow_rules.delay(
                issue_id=str(issue.id),
                trigger_type=trigger_type_out,
                trigger_snapshot=snapshot,
                actor_id=str(cascade_actor_id) if cascade_actor_id else None,
                chain_depth=chain_depth + 1,
            )
