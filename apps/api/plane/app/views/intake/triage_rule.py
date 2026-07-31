# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re

# Django imports
from django.db.models import Max

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import TriageRuleSerializer
from plane.db.models import Project, TriageRule, TriageRuleAction, TriageRuleCondition
from plane.utils.triage_rule_engine import dry_run_rule, reapply_triage_rules
from ..base import BaseAPIView, BaseViewSet

MAX_ACTIVE_RULES_PER_PROJECT = 20
MAX_CONDITIONS_PER_RULE = 5
MAX_ACTIONS_PER_RULE = 5


def _validate_conditions(conditions_data):
    if len(conditions_data) > MAX_CONDITIONS_PER_RULE:
        return f"A rule can have at most {MAX_CONDITIONS_PER_RULE} conditions"
    for condition in conditions_data:
        if condition.get("operator") == "REGEX":
            try:
                re.compile(condition.get("value", ""))
            except re.error as e:
                return f"Invalid regex '{condition.get('value')}': {e}"
    return None


def _validate_actions(actions_data):
    if len(actions_data) > MAX_ACTIONS_PER_RULE:
        return f"A rule can have at most {MAX_ACTIONS_PER_RULE} actions"
    return None


class TriageRuleViewSet(BaseViewSet):
    serializer_class = TriageRuleSerializer
    model = TriageRule

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .prefetch_related("conditions", "actions")
            .order_by("sort_order")
        )

    def _replace_conditions(self, rule, conditions_data):
        TriageRuleCondition.objects.filter(rule=rule).delete()
        TriageRuleCondition.objects.bulk_create(
            [
                TriageRuleCondition(
                    rule=rule,
                    project_id=rule.project_id,
                    workspace_id=rule.workspace_id,
                    field=condition["field"],
                    operator=condition["operator"],
                    value=condition["value"],
                    case_sensitive=condition.get("case_sensitive", False),
                )
                for condition in conditions_data
            ]
        )

    def _replace_actions(self, rule, actions_data):
        TriageRuleAction.objects.filter(rule=rule).delete()
        for action_data in actions_data:
            action = TriageRuleAction.objects.create(
                rule=rule,
                project_id=rule.project_id,
                workspace_id=rule.workspace_id,
                action_type=action_data["action_type"],
                priority=action_data.get("priority"),
                state_id=action_data.get("state"),
            )
            if action_data.get("labels"):
                action.labels.set(action_data["labels"])
            if action_data.get("assignees"):
                action.assignees.set(action_data["assignees"])

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id):
        serializer = self.serializer_class(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def retrieve(self, request, slug, project_id, pk):
        rule = self.get_queryset().filter(pk=pk).first()
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(rule).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        is_active = request.data.get("is_active", True)
        if is_active and TriageRule.objects.filter(project_id=project_id, is_active=True).count() >= (
            MAX_ACTIVE_RULES_PER_PROJECT
        ):
            return Response(
                {"error": f"Maximum of {MAX_ACTIVE_RULES_PER_PROJECT} active triage rules per project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conditions_data = request.data.get("conditions", [])
        actions_data = request.data.get("actions", [])
        error = _validate_conditions(conditions_data) or _validate_actions(actions_data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        max_sort_order = (
            TriageRule.objects.filter(project_id=project_id).aggregate(Max("sort_order"))["sort_order__max"] or 0
        )
        rule = TriageRule.objects.create(
            project_id=project_id,
            workspace_id=project.workspace_id,
            name=request.data.get("name", "Untitled rule"),
            description=request.data.get("description", ""),
            is_active=is_active,
            stop_on_match=request.data.get("stop_on_match", True),
            sort_order=max_sort_order + 10000,
        )
        self._replace_conditions(rule, conditions_data)
        self._replace_actions(rule, actions_data)

        rule = self.get_queryset().filter(pk=rule.pk).first()
        return Response(self.serializer_class(rule).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        rule = self.get_queryset().filter(pk=pk).first()
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)

        is_active = request.data.get("is_active", rule.is_active)
        if (
            is_active
            and not rule.is_active
            and TriageRule.objects.filter(project_id=project_id, is_active=True).count() >= MAX_ACTIVE_RULES_PER_PROJECT
        ):
            return Response(
                {"error": f"Maximum of {MAX_ACTIVE_RULES_PER_PROJECT} active triage rules per project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conditions_data = request.data.get("conditions")
        actions_data = request.data.get("actions")
        error = (_validate_conditions(conditions_data) if conditions_data is not None else None) or (
            _validate_actions(actions_data) if actions_data is not None else None
        )
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        for field in ["name", "description", "is_active", "stop_on_match"]:
            if field in request.data:
                setattr(rule, field, request.data[field])
        # Re-editing a rule's own actions/conditions marks it valid again -
        # this is the intended way to fix a rule flagged invalid by the
        # engine (exigence 10 de la spec).
        if conditions_data is not None or actions_data is not None:
            rule.is_valid = True
        rule.save()

        if conditions_data is not None:
            self._replace_conditions(rule, conditions_data)
        if actions_data is not None:
            self._replace_actions(rule, actions_data)

        rule = self.get_queryset().filter(pk=rule.pk).first()
        return Response(self.serializer_class(rule).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        rule = self.get_queryset().filter(pk=pk).first()
        if rule is not None:
            rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TriageRuleReorderEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        ordered_ids = request.data.get("rule_ids", [])
        if not isinstance(ordered_ids, list) or not ordered_ids:
            return Response({"error": "rule_ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)

        rules = {
            str(rule.id): rule
            for rule in TriageRule.objects.filter(workspace__slug=slug, project_id=project_id, id__in=ordered_ids)
        }
        updated = []
        for index, rule_id in enumerate(ordered_ids):
            rule = rules.get(str(rule_id))
            if rule is None:
                continue
            rule.sort_order = (index + 1) * 10000
            updated.append(rule)

        TriageRule.objects.bulk_update(updated, ["sort_order"], batch_size=100)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TriageRuleDryRunEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, pk):
        rule = TriageRule.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)

        results = dry_run_rule(rule, project_id)
        return Response({"matches": results}, status=status.HTTP_200_OK)


class TriageRuleReapplyEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        applied_count = reapply_triage_rules(project_id, actor_id=request.user.id)
        return Response({"applied_count": applied_count}, status=status.HTTP_200_OK)
