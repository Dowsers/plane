# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from plane.db.models.base import BaseModel
from plane.db.models.project import ProjectBaseModel


class WorkflowRule(ProjectBaseModel):
    """
    Project-scoped automation rule: trigger + optional AND-combined
    conditions + ordered actions, executed asynchronously on issue events -
    see docs/feature-specs/06-automation-workflow-sla.md ("Moteur de regles
    d'automatisation") in plane-selfhost.

    Structurally similar to TriageRule (`triage_rule.py`), which is
    deliberately left untouched - it only fires at intake-creation time for
    a narrower use case. This is a separate, genuinely new set of tables
    covering the full issue-lifecycle trigger vocabulary below.
    """

    TRIGGER_TYPE_CHOICES = (
        ("ISSUE_CREATED", "Issue created"),
        ("ISSUE_UPDATED", "Issue updated"),
        ("STATE_CHANGED", "State changed"),
        ("ASSIGNEE_CHANGED", "Assignee changed"),
        ("PRIORITY_CHANGED", "Priority changed"),
        ("LABEL_ADDED", "Label added"),
        ("COMMENT_ADDED", "Comment added"),
    )

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    trigger_type = models.CharField(max_length=30, choices=TRIGGER_TYPE_CHOICES)
    # Optional/partial trigger-level filter evaluated against the trigger's
    # own snapshot before conditions are even evaluated - e.g. for
    # STATE_CHANGED: {"from_state_id": "...", "to_state_id": "..."} - either
    # key alone means "any -> X" or "X -> any".
    trigger_config = models.JSONField(default=dict, blank=True)
    # AND-combined leaf conditions, e.g.
    # [{"field": "priority", "operator": "in", "value": ["urgent", "high"]}] -
    # translated to IssueFilterSet leaf dicts at evaluation time, see
    # plane/utils/workflow_rule_engine.py.
    conditions = models.JSONField(default=list, blank=True)
    execution_count = models.IntegerField(default=0)
    last_triggered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Workflow Rule"
        verbose_name_plural = "Workflow Rules"
        db_table = "workflow_rules"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.project_id}>"


class WorkflowAction(BaseModel):
    ACTION_TYPE_CHOICES = (
        ("SET_STATE", "Set state"),
        ("SET_PRIORITY", "Set priority"),
        ("SET_ASSIGNEES", "Set assignees"),
        ("ADD_LABELS", "Add labels"),
        ("REMOVE_LABELS", "Remove labels"),
        ("SET_DUE_DATE", "Set due date"),
        ("SET_START_DATE", "Set start date"),
        ("POST_COMMENT", "Post comment"),
        ("MENTION_USER", "Mention user"),
    )

    rule = models.ForeignKey(WorkflowRule, on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=30, choices=ACTION_TYPE_CHOICES)
    # Shapes documented on WorkflowRule's docstring / feature spec, e.g.
    # SET_STATE: {"state_id": "..."} ; SET_ASSIGNEES: {"assignee_ids": [...], "mode": "replace"|"add"} ;
    # POST_COMMENT: {"comment_template": "text with {{issue.identifier}} tokens"}.
    action_config = models.JSONField(default=dict, blank=True)
    sort_order = models.PositiveIntegerField()

    class Meta:
        verbose_name = "Workflow Action"
        verbose_name_plural = "Workflow Actions"
        db_table = "workflow_actions"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.action_type} <{self.rule_id}>"


class WorkflowRuleExecutionLog(BaseModel):
    STATUS_CHOICES = (
        ("SUCCESS", "Success"),
        ("FAILED", "Failed"),
        ("SKIPPED", "Skipped"),
    )

    rule = models.ForeignKey(WorkflowRule, on_delete=models.CASCADE, related_name="execution_logs")
    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, db_index=True, related_name="workflow_rule_execution_logs"
    )
    # Snapshot of the rule's trigger_type at the time this row was written -
    # a rule's trigger_type could theoretically be edited later, this keeps
    # the historical record accurate.
    trigger_event = models.CharField(max_length=30)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    # Best-effort, sequential application - see
    # plane/utils/workflow_rule_engine.py. Snapshot of what actually
    # happened per action: [{"action_id": "...", "action_type": "...",
    # "status": "applied"|"failed", ...}, ...]
    actions_applied = models.JSONField(default=list, blank=True)
    error_message = models.TextField(null=True, blank=True)
    chain_depth = models.PositiveIntegerField(default=0)
    executed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Workflow Rule Execution Log"
        verbose_name_plural = "Workflow Rule Execution Logs"
        db_table = "workflow_rule_execution_logs"
        ordering = ("-executed_at",)
        indexes = [models.Index(fields=["rule", "executed_at"], name="wf_rule_log_rule_exec_idx")]

    def __str__(self):
        return f"{self.trigger_event} {self.status} <{self.rule_id}>"
