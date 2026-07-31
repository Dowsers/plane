# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel


class TriageRule(ProjectBaseModel):
    """
    Conditional triage rule, evaluated top-down against newly created
    IntakeIssue items - see docs/feature-specs/02-cycles-intake.md
    ("Moteur de règles de triage conditionnelles") in plane-selfhost.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.FloatField(default=65535)
    stop_on_match = models.BooleanField(default=True)
    # Automatically flipped to False (never deleted) if one of this rule's
    # actions references a label/state/member that no longer exists -
    # exigence 10 de la spec.
    is_valid = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Triage Rule"
        verbose_name_plural = "Triage Rules"
        db_table = "triage_rules"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.name} <{self.project_id}>"


class TriageRuleCondition(ProjectBaseModel):
    FIELD_CHOICES = (("TITLE", "Title"), ("DESCRIPTION", "Description"))
    OPERATOR_CHOICES = (
        ("CONTAINS", "Contains"),
        ("NOT_CONTAINS", "Not contains"),
        ("STARTS_WITH", "Starts with"),
        ("REGEX", "Regex"),
    )

    rule = models.ForeignKey(TriageRule, on_delete=models.CASCADE, related_name="conditions")
    field = models.CharField(max_length=20, choices=FIELD_CHOICES)
    operator = models.CharField(max_length=20, choices=OPERATOR_CHOICES)
    value = models.TextField()
    case_sensitive = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Triage Rule Condition"
        verbose_name_plural = "Triage Rule Conditions"
        db_table = "triage_rule_conditions"
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.field} {self.operator} <{self.rule_id}>"


class TriageRuleAction(ProjectBaseModel):
    ACTION_TYPE_CHOICES = (
        ("SET_PRIORITY", "Set priority"),
        ("SET_LABELS", "Set labels"),
        ("SET_ASSIGNEES", "Set assignees"),
        ("SET_STATE", "Set state"),
    )

    rule = models.ForeignKey(TriageRule, on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=20, choices=ACTION_TYPE_CHOICES)
    priority = models.CharField(max_length=30, null=True, blank=True)
    state = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="triage_rule_actions"
    )
    labels = models.ManyToManyField("db.Label", blank=True, related_name="triage_rule_actions")
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="triage_rule_assignee_actions"
    )

    class Meta:
        verbose_name = "Triage Rule Action"
        verbose_name_plural = "Triage Rule Actions"
        db_table = "triage_rule_actions"
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.action_type} <{self.rule_id}>"
