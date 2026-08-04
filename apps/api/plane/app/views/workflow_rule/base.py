# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorkflowRuleExecutionLogSerializer, WorkflowRuleSerializer
from plane.db.models import Project, WorkflowAction, WorkflowRule, WorkflowRuleExecutionLog
from ..base import BaseAPIView, BaseViewSet

MAX_ACTIONS_PER_RULE = 20


def _validate_actions_payload(actions_data):
    """Returns an error string, or None if valid. `actions_data is None`
    (key absent from the PATCH payload) is treated as "leave actions
    untouched", distinct from an explicit empty list."""
    if actions_data is None:
        return None
    if len(actions_data) == 0:
        # Saving a rule with zero actions must fail - exigence 2 de
        # docs/feature-specs/06-automation-workflow-sla.md ("Moteur de
        # regles d'automatisation") in plane-selfhost.
        return "A workflow rule must have at least one action"
    if len(actions_data) > MAX_ACTIONS_PER_RULE:
        return f"A rule can have at most {MAX_ACTIONS_PER_RULE} actions"
    return None


class WorkflowRuleViewSet(BaseViewSet):
    """
    ADMIN-only for every verb, including read - exigence 1 de la spec
    ("Seuls les utilisateurs ayant le role Admin ... Les roles
    Member/Guest/Viewer n'ont pas acces a l'onglet"), unlike the structurally
    similar TriageRuleViewSet (app/views/intake/triage_rule.py) which allows
    ROLE.MEMBER read access - that difference is intentional per this
    feature's own exigence, not an oversight.
    """

    serializer_class = WorkflowRuleSerializer
    model = WorkflowRule

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .prefetch_related("actions")
            .order_by("-created_at")
        )

    def _create_actions(self, rule, actions_data):
        WorkflowAction.objects.bulk_create(
            [
                WorkflowAction(
                    rule=rule,
                    action_type=action_data["action_type"],
                    action_config=action_data.get("action_config", {}),
                    sort_order=action_data.get("sort_order", index),
                )
                for index, action_data in enumerate(actions_data)
            ]
        )

    def _reconcile_actions(self, rule, actions_data):
        """PATCH accepts the full `actions` array and reconciles: update
        existing actions by id, create new ones without an id, delete ones
        no longer present."""
        existing = {str(a.id): a for a in rule.actions.all()}
        seen_ids = set()
        for index, action_data in enumerate(actions_data):
            action_id = action_data.get("id")
            sort_order = action_data.get("sort_order", index)
            if action_id and str(action_id) in existing:
                action = existing[str(action_id)]
                action.action_type = action_data.get("action_type", action.action_type)
                action.action_config = action_data.get("action_config", action.action_config)
                action.sort_order = sort_order
                action.save(update_fields=["action_type", "action_config", "sort_order"])
                seen_ids.add(str(action_id))
            else:
                WorkflowAction.objects.create(
                    rule=rule,
                    action_type=action_data["action_type"],
                    action_config=action_data.get("action_config", {}),
                    sort_order=sort_order,
                )
        for action_id, action in existing.items():
            if action_id not in seen_ids:
                action.delete()

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def list(self, request, slug, project_id):
        serializer = self.serializer_class(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def retrieve(self, request, slug, project_id, pk):
        rule = self.get_queryset().filter(pk=pk).first()
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(rule).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        actions_data = request.data.get("actions", [])
        error = _validate_actions_payload(actions_data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        trigger_type = request.data.get("trigger_type")
        if trigger_type not in dict(WorkflowRule.TRIGGER_TYPE_CHOICES):
            return Response({"error": "Invalid or missing trigger_type"}, status=status.HTTP_400_BAD_REQUEST)

        rule = WorkflowRule.objects.create(
            project_id=project_id,
            workspace_id=project.workspace_id,
            name=request.data.get("name", "Untitled rule"),
            description=request.data.get("description", ""),
            is_active=request.data.get("is_active", True),
            trigger_type=trigger_type,
            trigger_config=request.data.get("trigger_config", {}),
            conditions=request.data.get("conditions", []),
        )
        self._create_actions(rule, actions_data)

        rule = self.get_queryset().filter(pk=rule.pk).first()
        return Response(self.serializer_class(rule).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def partial_update(self, request, slug, project_id, pk):
        rule = self.get_queryset().filter(pk=pk).first()
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)

        actions_data = request.data.get("actions")
        error = _validate_actions_payload(actions_data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        if "trigger_type" in request.data and request.data["trigger_type"] not in dict(
            WorkflowRule.TRIGGER_TYPE_CHOICES
        ):
            return Response({"error": "Invalid trigger_type"}, status=status.HTTP_400_BAD_REQUEST)

        for field in ["name", "description", "is_active", "trigger_type", "trigger_config", "conditions"]:
            if field in request.data:
                setattr(rule, field, request.data[field])
        rule.save()

        if actions_data is not None:
            self._reconcile_actions(rule, actions_data)

        rule = self.get_queryset().filter(pk=rule.pk).first()
        return Response(self.serializer_class(rule).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def destroy(self, request, slug, project_id, pk):
        rule = self.get_queryset().filter(pk=pk).first()
        if rule is not None:
            rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowRuleToggleEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        rule = WorkflowRule.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)
        rule.is_active = not rule.is_active
        rule.save(update_fields=["is_active"])
        return Response(WorkflowRuleSerializer(rule).data, status=status.HTTP_200_OK)


class WorkflowRuleExecutionLogEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def get(self, request, slug, project_id, pk):
        rule = WorkflowRule.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)

        logs = WorkflowRuleExecutionLog.objects.filter(rule=rule)

        status_param = request.GET.get("status")
        if status_param:
            logs = logs.filter(status=status_param.upper())

        date_from = request.GET.get("date_from")
        if date_from:
            logs = logs.filter(executed_at__gte=date_from)

        date_to = request.GET.get("date_to")
        if date_to:
            logs = logs.filter(executed_at__lte=date_to)

        return self.paginate(
            request=request,
            order_by=request.GET.get("order_by", "-executed_at"),
            queryset=logs,
            on_results=lambda execution_logs: WorkflowRuleExecutionLogSerializer(execution_logs, many=True).data,
        )


class WorkflowRuleDuplicateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        rule = (
            WorkflowRule.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk)
            .prefetch_related("actions")
            .first()
        )
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)

        # is_active=False on the copy - safer default than silently
        # activating a duplicate automation.
        new_rule = WorkflowRule.objects.create(
            project_id=rule.project_id,
            workspace_id=rule.workspace_id,
            name=f"{rule.name} (copy)",
            description=rule.description,
            is_active=False,
            trigger_type=rule.trigger_type,
            trigger_config=rule.trigger_config,
            conditions=rule.conditions,
        )
        WorkflowAction.objects.bulk_create(
            [
                WorkflowAction(
                    rule=new_rule,
                    action_type=action.action_type,
                    action_config=action.action_config,
                    sort_order=action.sort_order,
                )
                for action in rule.actions.all()
            ]
        )

        new_rule = WorkflowRule.objects.filter(pk=new_rule.pk).prefetch_related("actions").first()
        return Response(WorkflowRuleSerializer(new_rule).data, status=status.HTTP_201_CREATED)
