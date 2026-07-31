# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import re

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, IssueAssignee, IssueLabel, Label, ProjectMember, State, TriageRule
from plane.db.models.intake import IntakeIssueStatus


def _condition_matches(condition, title, description):
    text = title if condition.field == "TITLE" else description or ""
    if condition.operator == "REGEX":
        flags = 0 if condition.case_sensitive else re.IGNORECASE
        try:
            return re.search(condition.value, text, flags) is not None
        except re.error:
            return False

    haystack = text if condition.case_sensitive else text.lower()
    needle = condition.value if condition.case_sensitive else condition.value.lower()
    if condition.operator == "CONTAINS":
        return needle in haystack
    if condition.operator == "NOT_CONTAINS":
        return needle not in haystack
    if condition.operator == "STARTS_WITH":
        return haystack.startswith(needle)
    return False


def _rule_matches(rule, title, description):
    return all(_condition_matches(condition, title, description) for condition in rule.conditions.all())


def find_matching_rule(project_id, title, description):
    """
    Top-down evaluation, first match wins - exigence 5 de
    docs/feature-specs/02-cycles-intake.md ("Moteur de règles de triage
    conditionnelles") in plane-selfhost.
    """
    rules = (
        TriageRule.objects.filter(project_id=project_id, is_active=True, is_valid=True)
        .prefetch_related("conditions")
        .order_by("sort_order")
    )
    for rule in rules:
        if _rule_matches(rule, title, description):
            return rule
    return None


def compute_rule_actions(rule, issue):
    """
    Pure computation of what this rule's actions would change on `issue`,
    with no database writes - shared by the real application path and by
    dry-run/preview so the two can never drift apart. Any action
    referencing a since-deleted label/state/member is skipped and flags
    `invalidated=True` - exigence 10 de la spec (la règle est désactivée,
    pas supprimée, sans provoquer d'erreur).
    """
    fields = {}
    invalidated = False

    for action in rule.actions.all():
        if action.action_type == "SET_PRIORITY":
            if not action.priority or action.priority not in dict(Issue.PRIORITY_CHOICES):
                invalidated = True
                continue
            fields["priority"] = action.priority

        elif action.action_type == "SET_STATE":
            if action.state_id is None or not State.objects.filter(
                id=action.state_id, project_id=issue.project_id
            ).exists():
                invalidated = True
                continue
            fields["state_id"] = str(action.state_id)

        elif action.action_type == "SET_LABELS":
            configured_ids = list(action.labels.values_list("id", flat=True))
            valid_ids = list(Label.objects.filter(id__in=configured_ids, project_id=issue.project_id).values_list(
                "id", flat=True
            ))
            if len(valid_ids) < len(configured_ids):
                invalidated = True
            if valid_ids:
                fields["label_ids"] = [str(lid) for lid in valid_ids]

        elif action.action_type == "SET_ASSIGNEES":
            configured_ids = list(action.assignees.values_list("id", flat=True))
            valid_ids = list(
                ProjectMember.objects.filter(
                    member_id__in=configured_ids, project_id=issue.project_id, is_active=True
                ).values_list("member_id", flat=True)
            )
            if len(valid_ids) < len(configured_ids):
                invalidated = True
            if valid_ids:
                fields["assignee_ids"] = [str(uid) for uid in valid_ids]

    return fields, invalidated


def apply_matching_rule(intake_issue, actor_id):
    """
    Finds and applies the first matching active rule to a freshly created
    intake issue - exigence 6 (asynchrone, à la création uniquement).
    No-op if no rule matches.
    """
    issue = intake_issue.issue
    rule = find_matching_rule(intake_issue.project_id, issue.name, issue.description_stripped or "")
    if rule is None:
        return

    _apply_rule_to_issue(rule, issue, intake_issue, actor_id)


def _apply_rule_to_issue(rule, issue, intake_issue, actor_id):
    fields, invalidated = compute_rule_actions(rule, issue)
    if invalidated:
        rule.is_valid = False
        rule.save(update_fields=["is_valid"])

    if not fields:
        return

    current_instance = {}
    issue_update_fields = []
    if "priority" in fields:
        current_instance["priority"] = issue.priority
        issue.priority = fields["priority"]
        issue_update_fields.append("priority")
    if "state_id" in fields:
        current_instance["state_id"] = str(issue.state_id) if issue.state_id else None
        issue.state_id = fields["state_id"]
        issue_update_fields.append("state_id")
    if issue_update_fields:
        issue.save(update_fields=issue_update_fields)

    if "label_ids" in fields:
        existing_ids = set(
            str(lid) for lid in IssueLabel.objects.filter(issue_id=issue.id).values_list("label_id", flat=True)
        )
        IssueLabel.objects.bulk_create(
            [
                IssueLabel(
                    issue_id=issue.id, label_id=label_id, project_id=issue.project_id, workspace_id=issue.workspace_id
                )
                for label_id in fields["label_ids"]
                if label_id not in existing_ids
            ],
            batch_size=100,
            ignore_conflicts=True,
        )

    if "assignee_ids" in fields:
        existing_ids = set(
            str(uid) for uid in IssueAssignee.objects.filter(issue_id=issue.id).values_list("assignee_id", flat=True)
        )
        IssueAssignee.objects.bulk_create(
            [
                IssueAssignee(
                    issue_id=issue.id,
                    assignee_id=assignee_id,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                )
                for assignee_id in fields["assignee_ids"]
                if assignee_id not in existing_ids
            ],
            batch_size=100,
            ignore_conflicts=True,
        )

    intake_issue.applied_triage_rule = rule
    intake_issue.triage_rule_snapshot = {"rule_id": str(rule.id), "rule_name": rule.name, "fields": fields}
    intake_issue.save(update_fields=["applied_triage_rule", "triage_rule_snapshot"])

    # Reuses the generic issue-activity field dispatch (same requested_data
    # shape as any manual edit), so this shows up in the issue's activity
    # feed like any other change - exigence 9 de la spec. The actor is the
    # rule's author, not a dedicated system/bot user (simplification - see
    # docker/api/triage-rule-engine/README.md in plane-selfhost).
    effective_actor_id = rule.created_by_id or actor_id
    if effective_actor_id is not None:
        # Both can be None for a public-form submission (docker/api/public-intake-form)
        # whose triage rule's author account was later deleted - skip only
        # the activity-log entry in that rare case, the field changes above
        # are applied regardless.
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps(fields, cls=DjangoJSONEncoder),
            current_instance=json.dumps(current_instance, cls=DjangoJSONEncoder),
            actor_id=str(effective_actor_id),
            issue_id=str(issue.id),
            project_id=str(issue.project_id),
            epoch=int(timezone.now().timestamp()),
            notification=True,
        )


def dry_run_rule(rule, project_id):
    """
    Simulates a rule against the current Pending queue without writing
    anything - exigence 8 de la spec.
    """
    from plane.db.models import IntakeIssue

    pending_items = IntakeIssue.objects.filter(
        project_id=project_id, status=IntakeIssueStatus.PENDING.value
    ).select_related("issue")

    results = []
    for intake_issue in pending_items:
        issue = intake_issue.issue
        if not _rule_matches(rule, issue.name, issue.description_stripped or ""):
            continue
        fields, _ = compute_rule_actions(rule, issue)
        results.append(
            {
                "intake_issue_id": str(intake_issue.id),
                "issue_id": str(issue.id),
                "issue_name": issue.name,
                "actions": fields,
            }
        )
    return results


def reapply_triage_rules(project_id, actor_id):
    """
    Manual, explicit re-run of the engine against the current Pending
    queue - exigence 7 de la spec (pas d'application rétroactive
    automatique).
    """
    from plane.db.models import IntakeIssue

    pending_items = IntakeIssue.objects.filter(
        project_id=project_id, status=IntakeIssueStatus.PENDING.value
    ).select_related("issue")

    applied_count = 0
    for intake_issue in pending_items:
        rule = find_matching_rule(project_id, intake_issue.issue.name, intake_issue.issue.description_stripped or "")
        if rule is None:
            continue
        _apply_rule_to_issue(rule, intake_issue.issue, intake_issue, actor_id)
        applied_count += 1
    return applied_count
