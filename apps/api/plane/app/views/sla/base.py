# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
SLA policy configuration CRUD - see
docs/feature-specs/06-automation-workflow-sla.md ("Politiques de SLA",
section 2) in plane-selfhost, exigence 1: Admin-only (workspace role,
level 20) for every verb including read, same convention
`WorkflowRuleViewSet` (app/views/workflow_rule/base.py) already uses for
its own config-screen-gating for the structurally similar reason - Member/
Guest never see the configuration screen at all, only the read-only
per-issue SLA status widget (see app/views/sla/issue.py).
"""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import SLAPolicySerializer
from plane.db.models import Issue, Label, Project, SLAPolicy, User, Workspace
from plane.db.models.state import StateGroup

from ..base import BaseAPIView, BaseViewSet

_VALID_PRIORITIES = {choice[0] for choice in Issue.PRIORITY_CHOICES}
_VALID_STATE_GROUPS = {choice.value for choice in StateGroup}


def _invalid_ids(queryset, ids):
    """Returns the subset of `ids` that don't exist in `queryset` - same
    shape as `_invalid_project_ids` in app/views/dashboard/base.py."""
    if not ids:
        return []
    ids = [str(i) for i in ids]
    existing = {str(i) for i in queryset.filter(id__in=ids).values_list("id", flat=True)}
    return [i for i in ids if i not in existing]


def _validate_policy_values(values):
    """`values` is the fully-merged (existing + requested) set of fields
    that matter for cross-field validation - used identically for create
    (merged against model defaults) and partial_update (merged against the
    existing row) so both paths enforce the same rules."""
    if not values.get("name"):
        return "Name is required"

    if not values.get("response_time_minutes") and not values.get("resolution_time_minutes"):
        # Exigence 3 / spec's own "contrainte : au moins un de
        # response_time_minutes/resolution_time_minutes non nul (validation
        # au niveau serializer, pas contrainte DB stricte)".
        return "At least one of response_time_minutes or resolution_time_minutes is required"

    invalid_priorities = sorted(set(values.get("priority_filter") or []) - _VALID_PRIORITIES)
    if invalid_priorities:
        return f"Invalid priority_filter values: {invalid_priorities}"

    invalid_state_groups = sorted(set(values.get("state_group_filter") or []) - _VALID_STATE_GROUPS)
    if invalid_state_groups:
        return f"Invalid state_group_filter values: {invalid_state_groups}"

    warning = values.get("warning_threshold_percent", 75)
    critical = values.get("critical_threshold_percent", 90)
    if critical <= warning:
        return "critical_threshold_percent must be greater than warning_threshold_percent"

    return None


class SLAPolicyViewSet(BaseViewSet):
    serializer_class = SLAPolicySerializer
    model = SLAPolicy

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .prefetch_related("projects", "labels", "assignees")
            .select_related("created_by")
        )

    def _apply_relations(self, policy, data, partial):
        if "project_ids" in data or not partial:
            policy.projects.set(data.get("project_ids", []))
        if "label_ids" in data or not partial:
            policy.labels.set(data.get("label_ids", []))
        if "assignee_ids" in data or not partial:
            policy.assignees.set(data.get("assignee_ids", []))

    def _relation_errors(self, slug, data):
        invalid_projects = _invalid_ids(Project.objects.filter(workspace__slug=slug), data.get("project_ids", []))
        if invalid_projects:
            return f"Invalid project_ids: {invalid_projects}"
        invalid_labels = _invalid_ids(Label.objects.filter(workspace__slug=slug), data.get("label_ids", []))
        if invalid_labels:
            return f"Invalid label_ids: {invalid_labels}"
        invalid_assignees = _invalid_ids(
            User.objects.filter(member_workspace__workspace__slug=slug, member_workspace__is_active=True),
            data.get("assignee_ids", []),
        )
        if invalid_assignees:
            return f"Invalid assignee_ids: {invalid_assignees}"
        return None

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def list(self, request, slug):
        policies = self.get_queryset()
        return Response(self.serializer_class(policies, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        policy = self.get_queryset().filter(pk=pk).first()
        if policy is None:
            return Response({"error": "SLA policy not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(policy).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        error = _validate_policy_values(data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        error = self._relation_errors(slug, data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        policy = SLAPolicy.objects.create(
            workspace_id=workspace.id,
            name=data.get("name"),
            description=data.get("description", ""),
            applies_to_all_projects=bool(data.get("applies_to_all_projects", False)),
            priority_filter=data.get("priority_filter", []),
            state_group_filter=data.get("state_group_filter", []),
            response_time_minutes=data.get("response_time_minutes"),
            resolution_time_minutes=data.get("resolution_time_minutes"),
            warning_threshold_percent=data.get("warning_threshold_percent", 75),
            critical_threshold_percent=data.get("critical_threshold_percent", 90),
            is_active=data.get("is_active", True),
        )
        self._apply_relations(policy, data, partial=False)

        policy = self.get_queryset().filter(pk=policy.pk).first()
        return Response(self.serializer_class(policy).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        policy = SLAPolicy.objects.filter(workspace__slug=slug, pk=pk).first()
        if policy is None:
            return Response({"error": "SLA policy not found"}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        merged = {
            "name": data.get("name", policy.name),
            "response_time_minutes": data.get("response_time_minutes", policy.response_time_minutes),
            "resolution_time_minutes": data.get("resolution_time_minutes", policy.resolution_time_minutes),
            "priority_filter": data.get("priority_filter", policy.priority_filter),
            "state_group_filter": data.get("state_group_filter", policy.state_group_filter),
            "warning_threshold_percent": data.get("warning_threshold_percent", policy.warning_threshold_percent),
            "critical_threshold_percent": data.get("critical_threshold_percent", policy.critical_threshold_percent),
        }
        error = _validate_policy_values(merged)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        error = self._relation_errors(slug, data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        for field in [
            "name",
            "description",
            "applies_to_all_projects",
            "priority_filter",
            "state_group_filter",
            "response_time_minutes",
            "resolution_time_minutes",
            "warning_threshold_percent",
            "critical_threshold_percent",
            "is_active",
            # `SLAPolicy.save()` only auto-computes `sort_order` at CREATE
            # time (same "auto-append, then explicit reorder later"
            # convention as `IssueView`/`State`/`DashboardWidget`) - an
            # explicit PATCH is the only way to actually change a policy's
            # precedence afterwards (exigence 4), so it must be writable
            # here.
            "sort_order",
        ]:
            if field in data:
                setattr(policy, field, data[field])
        policy.save()

        self._apply_relations(policy, data, partial=True)

        policy = self.get_queryset().filter(pk=policy.pk).first()
        return Response(self.serializer_class(policy).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        # Soft-delete (exigence 10 - "suppression logique ... pour
        # preserver l'historique du rapport de conformite"). `deleted_at`
        # is inherited from `AuditModel`/`SoftDeleteModel` - `.delete()`
        # already defaults to `soft=True`, no override needed here.
        # Existing `IssueSLA` rows keep their `sla_policy_id` (SET_NULL
        # only fires on a real hard delete, which this never does) - see
        # `IssueSLA` docstring.
        policy = SLAPolicy.objects.filter(workspace__slug=slug, pk=pk).first()
        if policy is not None:
            policy.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SLAPolicyDuplicateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        policy = (
            SLAPolicy.objects.filter(workspace__slug=slug, pk=pk)
            .prefetch_related("projects", "labels", "assignees")
            .first()
        )
        if policy is None:
            return Response({"error": "SLA policy not found"}, status=status.HTTP_404_NOT_FOUND)

        # is_active=False on the copy - safer default than silently
        # activating a duplicate policy, mirrors
        # WorkflowRuleDuplicateEndpoint's identical convention.
        new_policy = SLAPolicy.objects.create(
            workspace_id=policy.workspace_id,
            name=f"{policy.name} (copy)",
            description=policy.description,
            applies_to_all_projects=policy.applies_to_all_projects,
            priority_filter=policy.priority_filter,
            state_group_filter=policy.state_group_filter,
            response_time_minutes=policy.response_time_minutes,
            resolution_time_minutes=policy.resolution_time_minutes,
            warning_threshold_percent=policy.warning_threshold_percent,
            critical_threshold_percent=policy.critical_threshold_percent,
            is_active=False,
        )
        new_policy.projects.set(policy.projects.all())
        new_policy.labels.set(policy.labels.all())
        new_policy.assignees.set(policy.assignees.all())

        new_policy = (
            SLAPolicy.objects.filter(pk=new_policy.pk).prefetch_related("projects", "labels", "assignees").first()
        )
        return Response(SLAPolicySerializer(new_policy).data, status=status.HTTP_201_CREATED)
