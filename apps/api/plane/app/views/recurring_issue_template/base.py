# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueFlatSerializer, RecurringIssueTemplateSerializer
from plane.bgtasks.recurring_issue_task import materialize_occurrence
from plane.db.models import (
    EstimatePoint,
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    RecurringIssueTemplate,
    RecurringIssueTemplateAssignee,
    RecurringIssueTemplateLabel,
    State,
)
from plane.utils.recurring_issue_schedule import compute_first_run_at, compute_next_run_at
from ..base import BaseAPIView, BaseViewSet

# Editing any of these requires recomputing next_run_at (see
# RecurringIssueTemplateViewSet.partial_update below).
RECURRENCE_AFFECTING_FIELDS = {
    "frequency",
    "interval",
    "weekdays",
    "day_of_month",
    "month_of_year",
    "timezone",
    "start_date",
}

READ_ROLES = [ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST]
WRITE_ROLES = [ROLE.ADMIN, ROLE.MEMBER]


def _valid_label_ids(project_id, label_ids):
    """Silently drops ids that don't belong to the project - mirrors
    IssueCreateSerializer's own leniency for label_ids."""
    if not label_ids:
        return []
    return list(Label.objects.filter(project_id=project_id, id__in=label_ids).values_list("id", flat=True))


def _valid_assignee_ids(project_id, assignee_ids):
    """Silently drops ids that aren't active project members with at
    least Member role - mirrors IssueCreateSerializer's own filtering for
    assignee_ids."""
    if not assignee_ids:
        return []
    return list(
        ProjectMember.objects.filter(
            project_id=project_id, member_id__in=assignee_ids, role__gte=15, is_active=True
        ).values_list("member_id", flat=True)
    )


def _sync_labels_and_assignees(template, label_ids, assignee_ids, actor_id):
    """Replaces the template's full label/assignee set. Uses this
    codebase's standard soft-delete-then-recreate pattern (the default
    `objects` manager on every AuditModel subclass is soft-delete-aware -
    see `plane/db/mixins.py`'s `SoftDeletionManager`/`SoftDeletionQuerySet`
    - so `.delete()` here sets `deleted_at` rather than removing rows,
    which is also why RecurringIssueTemplateAssignee's partial unique
    constraint on `(template, assignee)` never trips on the recreate)."""
    RecurringIssueTemplateLabel.objects.filter(template=template).delete()
    RecurringIssueTemplateAssignee.objects.filter(template=template).delete()

    if label_ids:
        RecurringIssueTemplateLabel.objects.bulk_create(
            [
                RecurringIssueTemplateLabel(
                    template=template,
                    label_id=label_id,
                    project_id=template.project_id,
                    workspace_id=template.workspace_id,
                    created_by_id=actor_id,
                    updated_by_id=actor_id,
                )
                for label_id in label_ids
            ]
        )
    if assignee_ids:
        RecurringIssueTemplateAssignee.objects.bulk_create(
            [
                RecurringIssueTemplateAssignee(
                    template=template,
                    assignee_id=assignee_id,
                    project_id=template.project_id,
                    workspace_id=template.workspace_id,
                    created_by_id=actor_id,
                    updated_by_id=actor_id,
                )
                for assignee_id in assignee_ids
            ]
        )


def _apply_recurrence_fields(template, data, project, partial):
    """Applies the recurrence-affecting + descriptive fields present in
    `data` onto `template` (not yet saved). Returns an error string, or
    None if valid. `partial=True` (PATCH) only touches keys present in
    `data`; `partial=False` (POST) expects the full set relevant to a
    template that's meant to be created active."""
    if "name" in data:
        template.name = data["name"]
    if "description_html" in data:
        template.description_html = data["description_html"]
    if "priority" in data:
        if data["priority"] not in dict(Issue.PRIORITY_CHOICES):
            return "Invalid priority"
        template.priority = data["priority"]
    if "state_id" in data:
        state_id = data["state_id"]
        if state_id and not State.objects.filter(pk=state_id, project_id=project.id).exists():
            return "State is not valid, please pass a valid state_id"
        template.state_id = state_id or None
    if "estimate_point_id" in data:
        estimate_point_id = data["estimate_point_id"]
        if estimate_point_id and not EstimatePoint.objects.filter(pk=estimate_point_id, project_id=project.id).exists():
            return "Estimate point is not valid, please pass a valid estimate_point_id"
        template.estimate_point_id = estimate_point_id or None

    if "frequency" in data:
        if data["frequency"] not in dict(RecurringIssueTemplate.FREQUENCY_CHOICES):
            return "Invalid or missing frequency"
        template.frequency = data["frequency"]
    if "interval" in data:
        interval = data["interval"] or 1
        if int(interval) < 1:
            return "interval must be a positive integer"
        template.interval = interval
    if "weekdays" in data:
        weekdays = data["weekdays"] or []
        if any(not isinstance(w, int) or w < 0 or w > 6 for w in weekdays):
            return "weekdays must be integers 0 (Monday) through 6 (Sunday)"
        template.weekdays = weekdays
    if "day_of_month" in data:
        day_of_month = data["day_of_month"]
        if day_of_month is not None and not (1 <= int(day_of_month) <= 31):
            return "day_of_month must be between 1 and 31"
        template.day_of_month = day_of_month
    if "month_of_year" in data:
        month_of_year = data["month_of_year"]
        if month_of_year is not None and not (1 <= int(month_of_year) <= 12):
            return "month_of_year must be between 1 and 12"
        template.month_of_year = month_of_year
    if "timezone" in data:
        template.timezone = data["timezone"] or project.timezone
    if "start_date" in data:
        start_date = parse_date(data["start_date"]) if data["start_date"] else None
        if data["start_date"] and start_date is None:
            return "start_date must be a valid ISO date (YYYY-MM-DD)"
        template.start_date = start_date
    if "end_date" in data:
        end_date = parse_date(data["end_date"]) if data["end_date"] else None
        if data["end_date"] and end_date is None:
            return "end_date must be a valid ISO date (YYYY-MM-DD)"
        template.end_date = end_date
    if "max_occurrences" in data:
        max_occurrences = data["max_occurrences"]
        if max_occurrences is not None and int(max_occurrences) < 1:
            return "max_occurrences must be a positive integer"
        template.max_occurrences = max_occurrences

    if not partial:
        if not template.frequency:
            return "frequency is required"
        if not template.start_date:
            return "start_date is required"

    return None


class RecurringIssueTemplateViewSet(BaseViewSet):
    serializer_class = RecurringIssueTemplateSerializer
    model = RecurringIssueTemplate

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .prefetch_related("labels", "assignees")
            .order_by("-created_at")
        )

    @allow_permission(READ_ROLES, level="PROJECT")
    def list(self, request, slug, project_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda templates: self.serializer_class(templates, many=True).data,
        )

    @allow_permission(READ_ROLES, level="PROJECT")
    def retrieve(self, request, slug, project_id, pk):
        template = self.get_queryset().filter(pk=pk).first()
        if template is None:
            return Response({"error": "Recurring issue template not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(template).data, status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES, level="PROJECT")
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        template = RecurringIssueTemplate(
            project_id=project_id,
            workspace_id=project.workspace_id,
            timezone=project.timezone,
        )
        error = _apply_recurrence_fields(template, request.data, project, partial=False)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        template.is_active = request.data.get("is_active", True)
        if template.is_active:
            template.next_run_at = compute_first_run_at(template)

        template.save(created_by_id=request.user.id)

        label_ids = _valid_label_ids(project_id, request.data.get("label_ids"))
        assignee_ids = _valid_assignee_ids(project_id, request.data.get("assignee_ids"))
        _sync_labels_and_assignees(template, label_ids, assignee_ids, request.user.id)

        template = self.get_queryset().filter(pk=template.pk).first()
        return Response(self.serializer_class(template).data, status=status.HTTP_201_CREATED)

    @allow_permission(WRITE_ROLES, level="PROJECT")
    def partial_update(self, request, slug, project_id, pk):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        template = self.get_queryset().filter(pk=pk).first()
        if template is None:
            return Response({"error": "Recurring issue template not found"}, status=status.HTTP_404_NOT_FOUND)

        recurrence_changed = any(field in request.data for field in RECURRENCE_AFFECTING_FIELDS)

        error = _apply_recurrence_fields(template, request.data, project, partial=True)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        if "is_active" in request.data:
            template.is_active = bool(request.data["is_active"])

        if template.is_active and (not template.frequency or not template.start_date):
            return Response(
                {"error": "frequency and start_date must be set before this template can be active"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Recompute whenever a recurrence-affecting field changed in this
        # request, OR this is the first time the template becomes active
        # with a schedule that was never computed (e.g. activating a
        # convert-to-recurring draft via a plain `{"is_active": true}`
        # PATCH after an earlier PATCH already set frequency/start_date) -
        # without the second condition, next_run_at would stay None
        # forever and the hourly scan's `next_run_at__lte=now()` filter
        # would never match this template.
        if template.is_active and (recurrence_changed or template.next_run_at is None):
            template.next_run_at = compute_first_run_at(template)

        template.save()

        if "label_ids" in request.data or "assignee_ids" in request.data:
            label_ids = (
                _valid_label_ids(project_id, request.data.get("label_ids"))
                if "label_ids" in request.data
                else list(template.labels.values_list("id", flat=True))
            )
            assignee_ids = (
                _valid_assignee_ids(project_id, request.data.get("assignee_ids"))
                if "assignee_ids" in request.data
                else list(template.assignees.values_list("id", flat=True))
            )
            _sync_labels_and_assignees(template, label_ids, assignee_ids, request.user.id)

        template = self.get_queryset().filter(pk=template.pk).first()
        return Response(self.serializer_class(template).data, status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES, level="PROJECT")
    def destroy(self, request, slug, project_id, pk):
        template = self.get_queryset().filter(pk=pk).first()
        if template is not None:
            template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RecurringIssueTemplatePauseEndpoint(BaseAPIView):
    @allow_permission(WRITE_ROLES, level="PROJECT")
    def post(self, request, slug, project_id, pk):
        template = RecurringIssueTemplate.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).first()
        if template is None:
            return Response({"error": "Recurring issue template not found"}, status=status.HTTP_404_NOT_FOUND)
        template.is_active = False
        template.save(update_fields=["is_active"])
        return Response(RecurringIssueTemplateSerializer(template).data, status=status.HTTP_200_OK)


class RecurringIssueTemplateResumeEndpoint(BaseAPIView):
    @allow_permission(WRITE_ROLES, level="PROJECT")
    def post(self, request, slug, project_id, pk):
        template = RecurringIssueTemplate.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).first()
        if template is None:
            return Response({"error": "Recurring issue template not found"}, status=status.HTTP_404_NOT_FOUND)
        if not template.frequency or not template.start_date:
            return Response(
                {"error": "frequency and start_date must be configured before resuming"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Exigence 10: resuming recalculates next_run_at from "now" - no
        # catch-up of occurrences missed while paused.
        template.is_active = True
        template.next_run_at = compute_next_run_at(template, after=timezone.now())
        template.save(update_fields=["is_active", "next_run_at"])
        return Response(RecurringIssueTemplateSerializer(template).data, status=status.HTTP_200_OK)


class RecurringIssueTemplateGenerateNowEndpoint(BaseAPIView):
    @allow_permission(WRITE_ROLES, level="PROJECT")
    def post(self, request, slug, project_id, pk):
        template = RecurringIssueTemplate.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).first()
        if template is None:
            return Response({"error": "Recurring issue template not found"}, status=status.HTTP_404_NOT_FOUND)
        if not template.frequency or not template.start_date:
            return Response(
                {"error": "frequency and start_date must be configured before generating an issue"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Deliberately does NOT touch next_run_at / occurrences_generated /
        # is_active - exigence 12 ("il ne modifie pas le calcul de la
        # prochaine échéance planifiée"). Works regardless of is_active,
        # which is the point of a manual "generate one now" action.
        with transaction.atomic():
            issue = materialize_occurrence(template)

        return Response(IssueFlatSerializer(issue).data, status=status.HTTP_201_CREATED)


class RecurringIssueTemplateGeneratedIssuesEndpoint(BaseAPIView):
    @allow_permission(READ_ROLES, level="PROJECT")
    def get(self, request, slug, project_id, pk):
        template = RecurringIssueTemplate.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).first()
        if template is None:
            return Response({"error": "Recurring issue template not found"}, status=status.HTTP_404_NOT_FOUND)

        issues = Issue.objects.filter(recurring_template_id=template.id).order_by("-created_at")
        return self.paginate(
            request=request,
            queryset=issues,
            on_results=lambda results: IssueFlatSerializer(results, many=True).data,
        )


class IssueConvertToRecurringEndpoint(BaseAPIView):
    """Issue-scoped (not template-scoped) - see
    `plane/app/urls/issue.py` for its URL registration under
    `.../issues/<issue_id>/convert-to-recurring/`."""

    @allow_permission(WRITE_ROLES, level="PROJECT")
    def post(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Pre-fills from the issue's current title/description/priority/
        # labels/assignees. Recurrence fields (frequency, start_date, ...)
        # are deliberately left unset and is_active=False - the user
        # configures + activates the recurrence afterwards via a normal
        # PATCH, per this endpoint's own spec.
        template = RecurringIssueTemplate.objects.create(
            project_id=project_id,
            workspace_id=issue.workspace_id,
            name=issue.name,
            description_html=issue.description_html,
            priority=issue.priority,
            state_id=issue.state_id,
            estimate_point_id=issue.estimate_point_id,
            timezone=issue.project.timezone,
            is_active=False,
            created_by_id=request.user.id,
        )

        label_ids = list(IssueLabel.objects.filter(issue=issue).values_list("label_id", flat=True))
        assignee_ids = list(IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True))
        _sync_labels_and_assignees(template, label_ids, assignee_ids, request.user.id)

        template = (
            RecurringIssueTemplate.objects.filter(pk=template.pk).prefetch_related("labels", "assignees").first()
        )
        return Response(RecurringIssueTemplateSerializer(template).data, status=status.HTTP_201_CREATED)
