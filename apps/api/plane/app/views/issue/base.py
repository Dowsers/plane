# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import copy
import json

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import (
    Count,
    Exists,
    F,
    Func,
    IntegerField,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
    Sum,
    UUIDField,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    IssueCreateSerializer,
    IssueDetailSerializer,
    IssueListDetailSerializer,
    IssueSerializer,
    ProjectUserPropertySerializer,
)
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.issue_description_version_task import issue_description_version_task
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.bgtasks.view_subscription_task import notify_view_subscribers
from plane.bgtasks.webhook_task import model_activity
from plane.bgtasks.slack_sync_task import dispatch_slack_channel_notifications
from plane.bgtasks.figma_sync_task import push_figma_status_comment
from plane.bgtasks.issue_triage_suggestion_task import generate_issue_triage_suggestion_task
from plane.bgtasks.issue_duplicate_detection_task import generate_issue_duplicate_suggestions_task
from plane.db.models import FigmaFileLink
from plane.db.models import (
    BulkIssueOperation,
    Cycle,
    CycleIssue,
    FileAsset,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    IssueLink,
    IssueReaction,
    IssueRelation,
    IssueSubscriber,
    IssueTransitionApprovalRequest,
    IssueWorklog,
    ProjectUserProperty,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    UserRecentVisit,
)
from plane.utils.filters import ComplexFilterBackend, IssueFilterSet
from plane.utils.global_paginator import paginate
from plane.utils.grouper import (
    issue_group_values,
    issue_on_results,
    issue_queryset_grouper,
)
from plane.utils.host import base_host
from plane.utils.idempotency import check_idempotency_key, store_idempotent_response
from plane.utils.issue_filters import issue_filters
from plane.utils.label_group import enforce_label_group_exclusivity
from plane.utils.order_queryset import order_issue_queryset
from plane.utils.paginator import GroupedOffsetPaginator, SubGroupedOffsetPaginator
from plane.utils.sub_issue_automation import handle_sub_issue_automations
from plane.utils.timezone_converter import user_timezone_converter
from plane.utils.view_subscriptions import get_subscribed_views_for_issue, issue_matches_view
from plane.utils.workflow_transition_engine import (
    create_approval_request,
    evaluate_transition,
    execute_allowed_transition,
)

from .. import BaseAPIView, BaseViewSet


def _get_or_create_pending_approval(issue, transition, requested_by):
    """Governed-workflow gate (phase 2 of docs/feature-specs/06-automation-
    workflow-sla.md, section 4 in plane-selfhost) - shared by
    `IssueViewSet.partial_update` and `BulkIssueOperationsEndpoint.post`.

    Auto-creates the `IssueTransitionApprovalRequest` right here instead of
    requiring the client to make a second round-trip to
    `IssueTransitionRequestApprovalEndpoint`
    (app/views/workflow_transition/base.py) - the caller already expressed
    intent to make this exact transition via their PATCH, so there is no new
    information a second client call would add. Dedupes against an already-
    PENDING request for the same (issue, transition) pair first, mirroring
    that endpoint's own dedup check, so repeated attempts at the same
    denied-for-now transition (e.g. re-dragging a Kanban card) don't spawn
    duplicate requests.
    """
    existing = IssueTransitionApprovalRequest.objects.filter(
        issue_id=issue.id, transition_id=transition.id, status="PENDING"
    ).first()
    if existing is not None:
        return existing
    return create_approval_request(issue, transition, requested_by)


class IssueListEndpoint(BaseAPIView):
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        issue_ids = request.GET.get("issues", False)

        if not issue_ids:
            return Response({"error": "Issues are required"}, status=status.HTTP_400_BAD_REQUEST)

        issue_ids = [issue_id for issue_id in issue_ids.split(",") if issue_id != ""]

        # Base queryset with basic filters
        queryset = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids)

        # Apply filtering from filterset
        queryset = self.filter_queryset(queryset)

        # Apply legacy filters
        filters = issue_filters(request.query_params, "GET")
        issue_queryset = queryset.filter(**filters)

        # Add select_related, prefetch_related if fields or expand is not None
        if self.fields or self.expand:
            issue_queryset = issue_queryset.select_related("workspace", "project", "state", "parent").prefetch_related(
                "assignees", "labels", "issue_module__module"
            )

        # Add annotations
        issue_queryset = (
            issue_queryset.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .distinct()
        )

        order_by_param = request.GET.get("order_by", "-created_at")
        # Issue queryset
        issue_queryset, _ = order_issue_queryset(issue_queryset=issue_queryset, order_by_param=order_by_param)

        # Group by
        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)

        # issue queryset
        issue_queryset = issue_queryset_grouper(queryset=issue_queryset, group_by=group_by, sub_group_by=sub_group_by)

        recent_visited_task.delay(
            slug=slug,
            project_id=project_id,
            entity_name="project",
            entity_identifier=project_id,
            user_id=request.user.id,
        )

        if self.fields or self.expand:
            issues = IssueSerializer(queryset, many=True, fields=self.fields, expand=self.expand).data
        else:
            issues = issue_queryset.values(
                "id",
                "name",
                "state_id",
                "sort_order",
                "completed_at",
                "estimate_point",
                "priority",
                "start_date",
                "target_date",
                "sequence_id",
                "project_id",
                "parent_id",
                "cycle_id",
                "module_ids",
                "label_ids",
                "assignee_ids",
                "sub_issues_count",
                "created_at",
                "updated_at",
                "created_by",
                "updated_by",
                "attachment_count",
                "link_count",
                "is_draft",
                "archived_at",
                "deleted_at",
            )
            datetime_fields = ["created_at", "updated_at"]
            issues = user_timezone_converter(issues, datetime_fields, request.user.user_timezone)
        return Response(issues, status=status.HTTP_200_OK)


class IssueViewSet(BaseViewSet):
    model = Issue
    webhook_event = "issue"
    search_fields = ["name"]
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def get_serializer_class(self):
        return IssueCreateSerializer if self.action in ["create", "update", "partial_update"] else IssueSerializer

    def get_queryset(self):
        issues = Issue.issue_objects.filter(
            project_id=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).distinct()

        return issues

    def apply_annotations(self, issues):
        issues = (
            issues.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
        )

        return issues

    @method_decorator(gzip_page)
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        extra_filters = {}
        if request.GET.get("updated_at__gt", None) is not None:
            extra_filters = {"updated_at__gt": request.GET.get("updated_at__gt")}

        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        query_params = request.query_params.copy()

        filters = issue_filters(query_params, "GET")
        order_by_param = request.GET.get("order_by", "-created_at")

        issue_queryset = self.get_queryset()

        # Apply rich filters
        issue_queryset = self.filter_queryset(issue_queryset)

        # Apply legacy filters
        issue_queryset = issue_queryset.filter(**filters, **extra_filters)

        # Keeping a copy of the queryset before applying annotations
        filtered_issue_queryset = copy.deepcopy(issue_queryset)

        # Applying annotations to the issue queryset
        issue_queryset = self.apply_annotations(issue_queryset)

        # Issue queryset
        issue_queryset, order_by_param = order_issue_queryset(
            issue_queryset=issue_queryset, order_by_param=order_by_param
        )

        # Group by
        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)

        # issue queryset
        issue_queryset = issue_queryset_grouper(queryset=issue_queryset, group_by=group_by, sub_group_by=sub_group_by)

        recent_visited_task.delay(
            slug=slug,
            project_id=project_id,
            entity_name="project",
            entity_identifier=project_id,
            user_id=request.user.id,
        )
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            issue_queryset = issue_queryset.filter(created_by=request.user)
            filtered_issue_queryset = filtered_issue_queryset.filter(created_by=request.user)

        if group_by:
            if sub_group_by:
                if group_by == sub_group_by:
                    return Response(
                        {
                            "error": "Group by and sub group by cannot have same parameters"  # noqa: E501
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    return self.paginate(
                        request=request,
                        order_by=order_by_param,
                        queryset=issue_queryset,
                        total_count_queryset=filtered_issue_queryset,
                        on_results=lambda issues: issue_on_results(
                            group_by=group_by, issues=issues, sub_group_by=sub_group_by
                        ),
                        paginator_cls=SubGroupedOffsetPaginator,
                        group_by_fields=issue_group_values(
                            field=group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                            queryset=filtered_issue_queryset,
                        ),
                        sub_group_by_fields=issue_group_values(
                            field=sub_group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                            queryset=filtered_issue_queryset,
                        ),
                        group_by_field_name=group_by,
                        sub_group_by_field_name=sub_group_by,
                        count_filter=Q(
                            Q(issue_intake__status=1)
                            | Q(issue_intake__status=-1)
                            | Q(issue_intake__status=2)
                            | Q(issue_intake__isnull=True),
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
            else:
                # Group paginate
                return self.paginate(
                    request=request,
                    order_by=order_by_param,
                    queryset=issue_queryset,
                    total_count_queryset=filtered_issue_queryset,
                    on_results=lambda issues: issue_on_results(
                        group_by=group_by, issues=issues, sub_group_by=sub_group_by
                    ),
                    paginator_cls=GroupedOffsetPaginator,
                    group_by_fields=issue_group_values(
                        field=group_by,
                        slug=slug,
                        project_id=project_id,
                        filters=filters,
                        queryset=filtered_issue_queryset,
                    ),
                    group_by_field_name=group_by,
                    count_filter=Q(
                        Q(issue_intake__status=1)
                        | Q(issue_intake__status=-1)
                        | Q(issue_intake__status=2)
                        | Q(issue_intake__isnull=True),
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
        else:
            return self.paginate(
                order_by=order_by_param,
                request=request,
                queryset=issue_queryset,
                total_count_queryset=filtered_issue_queryset,
                on_results=lambda issues: issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by),
            )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id)

        # Category 12, feature 4 ("Moteur de synchronisation local-first/
        # offline pour le web") - short-circuits and returns the original
        # response verbatim if this exact creation was already processed
        # under this `Idempotency-Key` (offline sync worker replaying a
        # queued mutation after a reconnect). No-op if the header is
        # absent. See `plane.utils.idempotency` module docstring.
        idempotent_response = check_idempotency_key(
            request, workspace_id=project.workspace_id, endpoint="issue.create"
        )
        if idempotent_response is not None:
            return idempotent_response

        serializer = IssueCreateSerializer(
            data=request.data,
            context={
                "project_id": project_id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
            },
        )

        if serializer.is_valid():
            serializer.save()

            # Track the issue
            issue_activity.delay(
                type="issue.activity.created",
                requested_data=json.dumps(self.request.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(serializer.data.get("id", None)),
                project_id=str(project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            # Category 7 ("3. App Slack open-source", exigence 11) - see
            # dispatch_slack_channel_notifications's own docstring for the
            # scoping guarantee (only ever queries mappings for THIS
            # project_id).
            dispatch_slack_channel_notifications.delay(
                project_id=str(project_id),
                event_type="issue_created",
                summary_text=f"New issue created: {serializer.data.get('name', '')}",
                payload_summary={"issue_id": str(serializer.data.get("id", None))},
            )
            # Category 9 feature 1 (docs/feature-specs/09-ai-features.md
            # "1. Auto-triage assiste par IA", exigence 1) - always fired,
            # unconditionally: the task itself (via
            # is_ai_triage_enabled_for_project) is responsible for the
            # workspace/project toggle check, so nothing here duplicates
            # that lookup on the request/response path, matching how
            # dispatch_slack_channel_notifications above is also fired
            # unconditionally and self-gates on the worker side. Never
            # blocks or slows down this response - `.delay()` only enqueues.
            # `empty_fields` is exigence 9's "only suggest for fields left
            # empty in the creation payload" - `module` is always included
            # since Issue has no way to receive a module assignment at
            # creation at all (see IssueTriageSuggestion's module docstring).
            empty_fields_at_creation = ["module"]
            if not request.data.get("assignee_ids"):
                empty_fields_at_creation.append("assignees")
            if not request.data.get("label_ids"):
                empty_fields_at_creation.append("labels")
            generate_issue_triage_suggestion_task.delay(
                issue_id=str(serializer.data.get("id", None)),
                empty_fields=empty_fields_at_creation,
            )
            # Category 9 feature 2 (docs/feature-specs/09-ai-features.md "2.
            # Detection de doublons/similarite", exigence 1/7) - always
            # fired unconditionally, same "task self-gates on enablement"
            # convention as the triage task above. Computes/persists this
            # new issue's own embedding (so it becomes a candidate for
            # future checks) and generates persisted "Doublons suggeres"
            # suggestions for it (user story 4) - independent of the LIVE
            # draft-check the frontend already ran before submission
            # (IssueDuplicateCheckEndpoint), which never persists anything.
            generate_issue_duplicate_suggestions_task.delay(
                issue_id=str(serializer.data.get("id", None)), actor_id=str(request.user.id)
            )
            queryset = self.get_queryset()
            queryset = self.apply_annotations(queryset)
            issue = (
                issue_queryset_grouper(
                    queryset=queryset.filter(pk=serializer.data["id"]),
                    group_by=None,
                    sub_group_by=None,
                )
                .values(
                    "id",
                    "name",
                    "state_id",
                    "sort_order",
                    "completed_at",
                    "estimate_point",
                    "priority",
                    "start_date",
                    "target_date",
                    "sequence_id",
                    "project_id",
                    "parent_id",
                    "cycle_id",
                    "module_ids",
                    "label_ids",
                    "assignee_ids",
                    "sub_issues_count",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "attachment_count",
                    "link_count",
                    "is_draft",
                    "archived_at",
                    "deleted_at",
                )
                .first()
            )
            datetime_fields = ["created_at", "updated_at"]
            issue = user_timezone_converter(issue, datetime_fields, request.user.user_timezone)
            # Send the model activity
            model_activity.delay(
                model_name="issue",
                model_id=str(serializer.data["id"]),
                requested_data=request.data,
                current_instance=None,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )
            # updated issue description version
            issue_description_version_task.delay(
                updated_issue=json.dumps(request.data, cls=DjangoJSONEncoder),
                issue_id=str(serializer.data["id"]),
                user_id=request.user.id,
                is_creating=True,
            )
            response = Response(issue, status=status.HTTP_201_CREATED)
            store_idempotent_response(
                request, workspace_id=project.workspace_id, endpoint="issue.create", response=response
            )
            return response
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], creator=True, model=Issue)
    def retrieve(self, request, slug, project_id, pk=None):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)

        issue = (
            Issue.objects.filter(
                project_id=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
                pk=pk,
            )
            .select_related("state")
            .annotate(cycle_id=Subquery(CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[:1]))
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                label_ids=Coalesce(
                    Subquery(
                        IssueLabel.objects.filter(issue_id=OuterRef("pk"))
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("label_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    Subquery(
                        IssueAssignee.objects.filter(
                            issue_id=OuterRef("pk"),
                            assignee__member_project__is_active=True,
                        )
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    Subquery(
                        ModuleIssue.objects.filter(
                            issue_id=OuterRef("pk"),
                            module__archived_at__isnull=True,
                        )
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("module_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .prefetch_related(
                Prefetch(
                    "issue_reactions",
                    queryset=IssueReaction.objects.select_related("issue", "actor"),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_link",
                    queryset=IssueLink.objects.select_related("created_by"),
                )
            )
            .annotate(
                is_subscribed=Exists(
                    IssueSubscriber.objects.filter(
                        workspace__slug=slug,
                        project_id=project_id,
                        issue_id=OuterRef("pk"),
                        subscriber=request.user,
                    )
                )
            )
            .annotate(
                # docs/feature-specs/14-pricing-gap-remediation.md ("14a.
                # Time Tracking and Work Logs", feature 1, exigence 8) -
                # sum of non-deleted IssueWorklog.duration for this issue,
                # so the sidebar/peek-overview badge doesn't need a
                # separate request.
                total_worklog_duration=Coalesce(
                    Subquery(
                        IssueWorklog.objects.filter(issue_id=OuterRef("pk"))
                        .values("issue_id")
                        .annotate(total=Sum("duration"))
                        .values("total")
                    ),
                    Value(0, output_field=IntegerField()),
                )
            )
        ).first()
        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the issue
        """

        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not issue.created_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        recent_visited_task.delay(
            slug=slug,
            entity_name="issue",
            entity_identifier=pk,
            user_id=request.user.id,
            project_id=project_id,
        )

        serializer = IssueDetailSerializer(issue, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], creator=True, model=Issue)
    def partial_update(self, request, slug, project_id, pk=None):
        queryset = self.get_queryset()
        queryset = self.apply_annotations(queryset)

        skip_activity = request.data.pop("skip_activity", False)
        is_description_update = request.data.get("description_html") is not None
        # Category 9 feature 2 (docs/feature-specs/09-ai-features.md "2.
        # Detection de doublons/similarite", exigence 7) - reuses this same
        # "was title/description part of this payload" detection point
        # (existing `is_description_update` above, extended with its title
        # equivalent) rather than re-deriving "did the content change" from
        # scratch. The actual "did it change MATERIALLY" decision still
        # happens inside the task itself via `IssueEmbedding.content_hash`
        # comparison - this is just the cheap request-time gate for whether
        # it's even worth enqueueing that check.
        is_title_update = "name" in request.data

        issue = (
            queryset.annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(~Q(labels__id__isnull=True) & Q(label_issue__deleted_at__isnull=True)),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    ArrayAgg(
                        "issue_module__module_id",
                        distinct=True,
                        filter=Q(
                            ~Q(issue_module__module_id__isnull=True)
                            & Q(issue_module__module__archived_at__isnull=True)
                            & Q(issue_module__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .filter(pk=pk)
            .first()
        )

        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Snapshot pre-update membership in every subscribed view relevant to
        # this issue (its own project's views, plus workspace-scoped views),
        # so the change can be diffed after save - see
        # docs/feature-specs/04-views-filters.md ("Abonnements/notifications
        # par vue") in plane-selfhost. Cheap no-op when nobody subscribes to
        # any relevant view (the common case).
        subscribed_views = list(get_subscribed_views_for_issue(slug, project_id))
        was_member_by_view_id = {view.id: issue_matches_view(pk, view) for view in subscribed_views}

        current_instance = json.dumps(IssueDetailSerializer(issue).data, cls=DjangoJSONEncoder)

        requested_data = json.dumps(self.request.data, cls=DjangoJSONEncoder)
        serializer = IssueCreateSerializer(issue, data=request.data, partial=True, context={"project_id": project_id})
        if serializer.is_valid():
            # --- Governed workflow gate (phase 2 of docs/feature-specs/
            # 06-automation-workflow-sla.md, section 4 in plane-selfhost).
            # Also covers Kanban drag-and-drop for free - confirmed to be
            # the exact same endpoint, no separate "move" API exists.
            #
            # Only evaluated for an actual state-change attempt: `state`
            # (source of the `state_id` input field) must be present in
            # validated_data (already resolved to a real `State` instance
            # and project-membership-validated by
            # IssueCreateSerializer.validate() above - reused as-is, not
            # duplicated here) AND differ from the issue's current state. A
            # same-state PATCH, or one that never touches state at all,
            # skips this whole block and behaves exactly as before.
            # `evaluate_transition` is called unconditionally otherwise - it
            # already returns "allowed" on its own for any project/issue-type
            # with zero configured WorkflowTransition rows (the open-graph,
            # backward-compatible case), so no redundant "is this project
            # governed" pre-check is added here.
            target_state = serializer.validated_data.get("state")
            transition_result = None
            pending_approval_response = None
            # Captured before serializer.save() mutates issue.state_id in
            # place - Category 7's own state-change notification hook
            # below (dispatch_slack_channel_notifications/
            # push_figma_status_comment) needs "did the state actually
            # change" and not just "was target_state present", since a
            # PATCH that re-sends the issue's current state_id unchanged
            # would otherwise look identical to a real transition by the
            # time that hook runs.
            state_actually_changing = target_state is not None and target_state.id != issue.state_id
            if state_actually_changing:
                transition_result = evaluate_transition(issue, target_state, request.user)
                if transition_result["outcome"] == "denied":
                    # Never call serializer.save() - the DB is untouched.
                    return Response(
                        {
                            "error_code": "TRANSITION_NOT_ALLOWED",
                            "reason": transition_result["reason"]["message"],
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                if transition_result["outcome"] == "pending_approval":
                    # The state field itself is rejected for now, but any
                    # OTHER fields bundled into this same PATCH are still
                    # applied below - rejecting the whole request would be
                    # more disruptive than necessary when e.g. a priority
                    # change was piggy-backed onto the same call. Auto-create
                    # (or reuse) the approval request immediately rather than
                    # requiring a second client round-trip to
                    # IssueTransitionRequestApprovalEndpoint.
                    serializer.validated_data.pop("state", None)
                    approval_request = _get_or_create_pending_approval(
                        issue, transition_result["transition"], request.user
                    )
                    pending_approval_response = {
                        "pending_approval": True,
                        "transition_id": str(transition_result["transition"].id),
                        "approval_request_id": str(approval_request.id),
                    }
                    # Strip the rejected state key out of the payloads fed to
                    # the activity/model-activity tasks below, so they don't
                    # report a state change that never actually happened -
                    # bgtasks/issue_activities_task.py::track_state diffs
                    # against this raw requested payload, not the post-save
                    # instance, so leaving the key in would log a phantom
                    # state-change activity entry.
                    requested_data = json.dumps(
                        {k: v for k, v in self.request.data.items() if k not in ("state_id", "state")},
                        cls=DjangoJSONEncoder,
                    )
                    request.data.pop("state_id", None)
                    request.data.pop("state", None)

            serializer.save()
            # Check if the update is a migration description update
            is_migration_description_update = skip_activity and is_description_update
            # Log all the updates
            if not is_migration_description_update:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=requested_data,
                    actor_id=str(request.user.id),
                    issue_id=str(pk),
                    project_id=str(project_id),
                    current_instance=current_instance,
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                    origin=base_host(request=request, is_app=True),
                )
                # Run any configured post-transition actions (system
                # comment, notify, label add/remove, webhook - see
                # utils/workflow_transition_engine.py) AFTER the raw
                # state-change activity entry above, so the activity feed's
                # causal order matches what a human reading it would expect:
                # the state change itself, then whatever it triggered. Only
                # reached for a real, "allowed" state-change attempt -
                # "denied" already returned early above, and
                # "pending_approval" already popped "state" out of
                # validated_data so this issue's state was never written.
                if transition_result is not None and transition_result["outcome"] == "allowed":
                    execute_allowed_transition(issue, target_state, request.user, transition_result["transition"])
                model_activity.delay(
                    model_name="issue",
                    model_id=str(serializer.data.get("id", None)),
                    requested_data=request.data,
                    current_instance=current_instance,
                    actor_id=request.user.id,
                    slug=slug,
                    origin=base_host(request=request, is_app=True),
                )
                # updated issue description version
                issue_description_version_task.delay(
                    updated_issue=current_instance,
                    issue_id=str(serializer.data.get("id", None)),
                    user_id=request.user.id,
                )
                # Category 9 feature 2 (docs/feature-specs/09-ai-features.md
                # "2. Detection de doublons/similarite", exigence 7) - only
                # enqueued when title or description was actually part of
                # this PATCH payload; the task itself further self-gates on
                # whether the content actually changed materially (via
                # IssueEmbedding.content_hash) and on the feature being
                # enabled at all (is_duplicate_detection_enabled_for_project).
                if is_title_update or is_description_update:
                    generate_issue_duplicate_suggestions_task.delay(
                        issue_id=str(pk), actor_id=str(request.user.id)
                    )
                if "state_id" in request.data or "state" in request.data:
                    handle_sub_issue_automations(issue, request.user.id)
                    # Category 7 - only wired into this single, primary
                    # state-mutation path (unitary update + Kanban drag,
                    # which share this same endpoint - see Category 6's
                    # own finding that Issue.state mutation is otherwise
                    # scattered across 7 code paths with no shared choke
                    # point). Bulk update and the public/token API's own
                    # update path are NOT wired - deliberately, same
                    # regression-risk judgment call already made for
                    # governed workflows in this codebase. Documented gap,
                    # not a silent omission.
                    if state_actually_changing and target_state is not None:
                        dispatch_slack_channel_notifications.delay(
                            project_id=str(project_id),
                            event_type="issue_status_changed",
                            summary_text=f"{issue.name} moved to {target_state.name}",
                            payload_summary={"issue_id": str(pk), "state": target_state.name},
                        )
                        for file_link_id in FigmaFileLink.objects.filter(
                            issue_id=pk, sync_status_enabled=True
                        ).values_list("id", flat=True):
                            push_figma_status_comment.delay(
                                file_link_id=str(file_link_id),
                                state_name=target_state.name,
                                state_group=target_state.group,
                            )

                # Diff post-update membership and notify - entering a view
                # always notifies (notify_on_add); leaving one only notifies
                # if the exit was via completing/cancelling the issue, never
                # for any other reason (e.g. reassignment), per spec
                # requirement 6.
                if subscribed_views:
                    issue.refresh_from_db(fields=["state_id"])
                    new_state_group = issue.state.group if issue.state_id else None
                    for view in subscribed_views:
                        was_member = was_member_by_view_id[view.id]
                        is_member = issue_matches_view(pk, view)
                        if not was_member and is_member:
                            notify_view_subscribers.delay(
                                issue_id=str(pk), view_id=str(view.id), event="add", actor_id=str(request.user.id)
                            )
                        elif was_member and not is_member:
                            if new_state_group == "completed":
                                notify_view_subscribers.delay(
                                    issue_id=str(pk),
                                    view_id=str(view.id),
                                    event="complete",
                                    actor_id=str(request.user.id),
                                )
                            elif new_state_group == "cancelled":
                                notify_view_subscribers.delay(
                                    issue_id=str(pk),
                                    view_id=str(view.id),
                                    event="cancel",
                                    actor_id=str(request.user.id),
                                )
            if pending_approval_response is not None:
                return Response(pending_approval_response, status=status.HTTP_200_OK)
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], creator=True, model=Issue)
    def destroy(self, request, slug, project_id, pk=None):
        issue = Issue.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)

        issue.delete()
        # delete the issue from recent visits
        UserRecentVisit.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            entity_identifier=pk,
            entity_name="issue",
        ).delete(soft=False)
        issue_activity.delay(
            type="issue.activity.deleted",
            requested_data=json.dumps({"issue_id": str(pk)}),
            actor_id=str(request.user.id),
            issue_id=str(pk),
            project_id=str(project_id),
            current_instance={},
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
            subscriber=False,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectUserDisplayPropertyEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id):
        try:
            issue_property = ProjectUserProperty.objects.get(
                user=request.user, 
                project_id=project_id
            )
        except ProjectUserProperty.DoesNotExist:
            issue_property = ProjectUserProperty.objects.create(
                user=request.user, 
                project_id=project_id
            )

        serializer = ProjectUserPropertySerializer(
            issue_property, 
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        issue_property, _ = ProjectUserProperty.objects.get_or_create(user=request.user, project_id=project_id)
        serializer = ProjectUserPropertySerializer(issue_property)
        return Response(serializer.data, status=status.HTTP_200_OK)


class BulkDeleteIssuesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])

        if not len(issue_ids):
            return Response({"error": "Issue IDs are required"}, status=status.HTTP_400_BAD_REQUEST)

        issues = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids)

        total_issues = len(issues)

        # First, delete all related cycle issues
        CycleIssue.objects.filter(issue_id__in=issue_ids).delete()

        # Then, delete all related module issues
        ModuleIssue.objects.filter(issue_id__in=issue_ids).delete()

        # Finally, delete the issues themselves
        issues.delete()

        return Response(
            {"message": f"{total_issues} issues were deleted"},
            status=status.HTTP_200_OK,
        )


class DeletedIssuesListViewSet(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        filters = {}
        if request.GET.get("updated_at__gt", None) is not None:
            filters = {"updated_at__gt": request.GET.get("updated_at__gt")}
        deleted_issues = (
            Issue.all_objects.filter(workspace__slug=slug, project_id=project_id)
            .filter(Q(archived_at__isnull=False) | Q(deleted_at__isnull=False))
            .filter(**filters)
            .values_list("id", flat=True)
        )

        return Response(deleted_issues, status=status.HTTP_200_OK)


class IssuePaginatedViewSet(BaseViewSet):
    def get_queryset(self):
        workspace_slug = self.kwargs.get("slug")
        project_id = self.kwargs.get("project_id")

        issue_queryset = Issue.issue_objects.filter(workspace__slug=workspace_slug, project_id=project_id)

        return (
            issue_queryset.select_related("state")
            .annotate(cycle_id=Subquery(CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[:1]))
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
        )

    def process_paginated_result(self, fields, results, timezone):
        paginated_data = results.values(*fields)

        # converting the datetime fields in paginated data
        datetime_fields = ["created_at", "updated_at"]
        paginated_data = user_timezone_converter(paginated_data, datetime_fields, timezone)

        return paginated_data

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        cursor = request.GET.get("cursor", None)
        is_description_required = request.GET.get("description", "false")
        updated_at = request.GET.get("updated_at__gt", None)

        # required fields
        required_fields = [
            "id",
            "name",
            "state_id",
            "state__group",
            "sort_order",
            "completed_at",
            "estimate_point",
            "priority",
            "start_date",
            "target_date",
            "sequence_id",
            "project_id",
            "parent_id",
            "cycle_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "is_draft",
            "archived_at",
            "module_ids",
            "label_ids",
            "assignee_ids",
            "link_count",
            "attachment_count",
            "sub_issues_count",
        ]

        if str(is_description_required).lower() == "true":
            required_fields.append("description_html")

        # querying issues
        base_queryset = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id)

        base_queryset = base_queryset.order_by("updated_at")
        queryset = self.get_queryset().order_by("updated_at")

        # validation for guest user
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        project_member = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            role=5,
            is_active=True,
        )
        if project_member.exists() and not project.guest_view_all_features:
            base_queryset = base_queryset.filter(created_by=request.user)
            queryset = queryset.filter(created_by=request.user)

        # filtering issues by greater then updated_at given by the user
        if updated_at:
            base_queryset = base_queryset.filter(updated_at__gt=updated_at)
            queryset = queryset.filter(updated_at__gt=updated_at)

        queryset = queryset.annotate(
            label_ids=Coalesce(
                Subquery(
                    IssueLabel.objects.filter(issue_id=OuterRef("pk"))
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("label_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            assignee_ids=Coalesce(
                Subquery(
                    IssueAssignee.objects.filter(
                        issue_id=OuterRef("pk"),
                        assignee__member_project__is_active=True,
                    )
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            module_ids=Coalesce(
                Subquery(
                    ModuleIssue.objects.filter(
                        issue_id=OuterRef("pk"),
                        module__archived_at__isnull=True,
                    )
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("module_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
        )

        paginated_data = paginate(
            base_queryset=base_queryset,
            queryset=queryset,
            cursor=cursor,
            on_result=lambda results: self.process_paginated_result(
                required_fields, results, request.user.user_timezone
            ),
        )

        return Response(paginated_data, status=status.HTTP_200_OK)


class IssueDetailEndpoint(BaseAPIView):
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def apply_annotations(self, issues):
        return (
            issues.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .prefetch_related(
                Prefetch(
                    "issue_assignee",
                    queryset=IssueAssignee.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "label_issue",
                    queryset=IssueLabel.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_module",
                    queryset=ModuleIssue.objects.all(),
                )
            )
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        filters = issue_filters(request.query_params, "GET")

        # check for the project member role, if the role is 5 then check for the guest_view_all_features
        #  if it is true then show all the issues else show only the issues created by the user
        permission_subquery = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, id=OuterRef("id"))
            .filter(
                Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role__gt=ROLE.GUEST.value,
                )
                | Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role=ROLE.GUEST.value,
                    project__guest_view_all_features=True,
                )
                | Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role=ROLE.GUEST.value,
                    project__guest_view_all_features=False,
                    created_by=self.request.user,
                )
            )
            .values("id")
        )
        # Main issue query
        issue = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id).filter(
            Exists(permission_subquery)
        )

        # Add additional prefetch based on expand parameter
        if self.expand:
            if "issue_relation" in self.expand:
                issue = issue.prefetch_related(
                    Prefetch(
                        "issue_relation",
                        queryset=IssueRelation.objects.select_related("related_issue"),
                    )
                )
            if "issue_related" in self.expand:
                issue = issue.prefetch_related(
                    Prefetch(
                        "issue_related",
                        queryset=IssueRelation.objects.select_related("issue"),
                    )
                )

        # Apply filtering from filterset
        issue = self.filter_queryset(issue)

        # Apply legacy filters
        issue = issue.filter(**filters)

        # Total count queryset
        total_issue_queryset = copy.deepcopy(issue)

        # Applying annotations to the issue queryset
        issue = self.apply_annotations(issue)

        order_by_param = request.GET.get("order_by", "-created_at")

        # Issue queryset
        issue, order_by_param = order_issue_queryset(issue_queryset=issue, order_by_param=order_by_param)
        return self.paginate(
            request=request,
            order_by=order_by_param,
            queryset=issue,
            total_count_queryset=total_issue_queryset,
            on_results=lambda issue: IssueListDetailSerializer(
                issue, many=True, fields=self.fields, expand=self.expand
            ).data,
        )


class IssueBulkUpdateDateEndpoint(BaseAPIView):
    def validate_dates(self, current_start, current_target, new_start, new_target):
        """
        Validate that start date is before target date.
        """
        from datetime import datetime

        start = new_start or current_start
        target = new_target or current_target

        # Convert string dates to datetime objects if they're strings
        if isinstance(start, str):
            start = datetime.strptime(start, "%Y-%m-%d").date()
        if isinstance(target, str):
            target = datetime.strptime(target, "%Y-%m-%d").date()

        if start and target and start > target:
            return False
        return True

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        updates = request.data.get("updates", [])

        issue_ids = [update["id"] for update in updates]
        epoch = int(timezone.now().timestamp())

        # Fetch all relevant issues in a single query
        issues = list(Issue.objects.filter(id__in=issue_ids, workspace__slug=slug, project_id=project_id))
        issues_dict = {str(issue.id): issue for issue in issues}
        issues_to_update = []

        for update in updates:
            issue_id = update["id"]
            issue = issues_dict.get(issue_id)

            if not issue:
                continue

            start_date = update.get("start_date")
            target_date = update.get("target_date")
            validate_dates = self.validate_dates(issue.start_date, issue.target_date, start_date, target_date)
            if not validate_dates:
                return Response(
                    {"message": "Start date cannot exceed target date"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if start_date:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"start_date": update.get("start_date")}),
                    current_instance=json.dumps({"start_date": str(issue.start_date)}),
                    issue_id=str(issue_id),
                    actor_id=str(request.user.id),
                    project_id=str(project_id),
                    epoch=epoch,
                )
                issue.start_date = start_date
                issues_to_update.append(issue)

            if target_date:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"target_date": update.get("target_date")}),
                    current_instance=json.dumps({"target_date": str(issue.target_date)}),
                    issue_id=str(issue_id),
                    actor_id=str(request.user.id),
                    project_id=str(project_id),
                    epoch=epoch,
                )
                issue.target_date = target_date
                issues_to_update.append(issue)

        # Bulk update issues
        Issue.objects.bulk_update(issues_to_update, ["start_date", "target_date"])

        return Response({"message": "Issues updated successfully"}, status=status.HTTP_200_OK)


# Scalar issue fields settable via bulk_issue_operations' "properties"
# payload with a plain setattr + bulk_update (no M2M/relation bookkeeping).
BULK_OPERATIONS_SCALAR_FIELDS = ("state_id", "priority", "start_date", "target_date", "estimate_point")

# Shared by BulkIssueOperationsEndpoint (session-authenticated, web UI) below
# and plane.api.views.issue.IssueBulkOperationsAPIEndpoint (API-token
# authenticated, plane-selfhost's CLI `plane issue bulk-update` - see
# docs/feature-specs/08-api-webhooks-cli.md section 5). Kept as a plain
# constant (not a class attribute) so both call sites reference the exact
# same cap without importing across view modules.
BULK_OPERATIONS_MAX_BATCH_SIZE = 100


def bulk_issue_operations(request, slug, project_id):
    """
    Batch-update state/priority/assignees/labels/dates/cycle/module across
    multiple issues in a single request. Archiving/deleting a batch already
    have their own endpoints (BulkArchiveIssuesEndpoint, BulkDeleteIssuesEndpoint)
    and are not handled here.

    A failure on one issue (e.g. the target cycle is already completed) does
    not fail the whole batch - see BulkIssueOperation.result for the per-issue
    success/failure breakdown. Implements the "Bulk/multi-select operations"
    spec in plane-selfhost's docs/feature-specs/01-core-issue-tracking.md.

    Extracted to a module-level function (rather than kept inline on
    BulkIssueOperationsEndpoint.post) so plane.api.views.issue's
    token-authenticated equivalent can call the exact same logic instead of
    duplicating it - the two call sites must never silently diverge in
    behavior. Only `request.data`/`request.user` are read from `request`, so
    it works identically under session auth and API-key auth.
    """
    issue_ids = request.data.get("issue_ids", [])
    properties = request.data.get("properties", {})

    if not issue_ids:
        return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(properties, dict) or not properties:
        return Response({"error": "properties is required"}, status=status.HTTP_400_BAD_REQUEST)
    if len(issue_ids) > BULK_OPERATIONS_MAX_BATCH_SIZE:
        return Response(
            {"error": f"A maximum of {BULK_OPERATIONS_MAX_BATCH_SIZE} issues can be updated in a single request"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    project = Project.objects.only("workspace_id").get(pk=project_id)
    operation = BulkIssueOperation.objects.create(
        project_id=project_id,
        workspace_id=project.workspace_id,
        actor_id=request.user.id,
        action_type=BulkIssueOperation.OperationType.UPDATE,
        issue_ids=issue_ids,
        properties=properties,
    )

    issues = list(
        Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids).select_related(
            "state"
        )
    )
    issues_by_id = {str(issue.id): issue for issue in issues}

    failed = {issue_id: [] for issue_id in issue_ids}
    succeeded_fields = {issue_id: [] for issue_id in issue_ids}
    # Governed workflow gate (phase 2 of docs/feature-specs/06-
    # automation-workflow-sla.md, section 4 in plane-selfhost) - same
    # per-issue-list-of-reasons shape as `failed`/`succeeded_fields`
    # above, reported as a third bucket alongside them rather than a
    # separate reporting mechanism.
    pending_approval = {issue_id: [] for issue_id in issue_ids}
    for missing_id in set(issue_ids) - set(issues_by_id.keys()):
        failed[missing_id].append("Issue not found")

    actor_id = str(request.user.id)
    epoch = int(timezone.now().timestamp())

    # --- Scalar fields: state, priority, dates, estimate ---
    scalar_updates = {f: properties[f] for f in BULK_OPERATIONS_SCALAR_FIELDS if f in properties}
    if scalar_updates:
        # The whole batch shares a single target state_id (`properties`
        # is one JSON body applied uniformly to every issue_id in
        # `issue_ids`), so the target State is resolved once here, then
        # `evaluate_transition` is called per issue below (each issue's
        # own from_state can differ). This endpoint bypasses
        # IssueCreateSerializer entirely (raw setattr + bulk_update, per
        # its own docstring), so - unlike the unitary/public-API call
        # sites - there is no pre-existing "state belongs to this
        # project" validation to reuse; resolving it here is new.
        gate_state = "state_id" in scalar_updates
        target_state = None
        if gate_state:
            target_state = State.objects.filter(pk=scalar_updates["state_id"], project_id=project_id).first()
            if target_state is None:
                for issue_id in issues_by_id.keys():
                    failed[issue_id].append("state_id: invalid state for this project")
                scalar_updates = {k: v for k, v in scalar_updates.items() if k != "state_id"}
                gate_state = False

        issues_to_update = []
        # issue_id -> WorkflowTransition to run post-transition actions
        # for once the shared bulk_update below commits - only populated
        # for issues whose state is both actually changing and was
        # evaluated "allowed".
        post_transition_by_issue_id = {}
        # issue_ids whose state field was actually applied this request
        # (allowed, or already at the target state - a same-state
        # no-op) - used below to decide which issues still get
        # `handle_sub_issue_automations`/post-transition actions,
        # mirroring this endpoint's pre-existing (ungated) behavior for
        # every issue that isn't newly denied/pending.
        state_applied_issue_ids = set()
        for issue_id, issue in issues_by_id.items():
            fields_for_issue = dict(scalar_updates)
            if gate_state:
                if str(issue.state_id) == str(target_state.id):
                    # Already at the target state - only invoke
                    # evaluate_transition when the target actually
                    # differs from the issue's current state, same rule
                    # as every other call site. Falls through to the
                    # unconditional per-issue write below, exactly
                    # matching this endpoint's pre-existing behavior for
                    # a same-state bulk update.
                    state_applied_issue_ids.add(issue_id)
                else:
                    result = evaluate_transition(issue, target_state, request.user)
                    if result["outcome"] == "denied":
                        failed[issue_id].append(f"state_id: {result['reason']['message']}")
                        fields_for_issue.pop("state_id", None)
                    elif result["outcome"] == "pending_approval":
                        approval_request = _get_or_create_pending_approval(
                            issue, result["transition"], request.user
                        )
                        pending_approval[issue_id].append(
                            f"state_id: pending approval (request {approval_request.id})"
                        )
                        fields_for_issue.pop("state_id", None)
                    else:
                        state_applied_issue_ids.add(issue_id)
                        post_transition_by_issue_id[issue_id] = result["transition"]

            if not fields_for_issue:
                # Every field requested for this issue was rejected
                # (state_id was the only scalar field and it was denied/
                # pending) - excluded entirely, matching exigence 11's
                # "chaque item est évalué individuellement".
                continue

            current_instance = {}
            requested_data = {}
            for field, value in fields_for_issue.items():
                current_value = getattr(issue, field)
                current_instance[field] = str(current_value) if current_value is not None else None
                setattr(issue, field, value)
                requested_data[field] = str(value) if value is not None else None
            issues_to_update.append(issue)
            succeeded_fields[issue_id].extend(fields_for_issue.keys())
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps(requested_data),
                current_instance=json.dumps(current_instance),
                issue_id=issue_id,
                actor_id=actor_id,
                project_id=str(project_id),
                epoch=epoch,
            )
        if issues_to_update:
            Issue.objects.bulk_update(issues_to_update, list(scalar_updates.keys()))
        if "state_id" in scalar_updates:
            for issue in issues_to_update:
                if str(issue.id) not in state_applied_issue_ids:
                    continue
                handle_sub_issue_automations(issue, request.user.id)
                # Run any configured post-transition actions after the
                # shared bulk_update has committed - only for issues
                # whose transition was freshly evaluated "allowed"
                # (already-at-target no-ops have no transition to run
                # actions for).
                transition = post_transition_by_issue_id.get(str(issue.id))
                if transition is not None:
                    execute_allowed_transition(issue, target_state, request.user, transition)

    # --- Labels: additive (an issue keeps its existing labels, new ones are
    # added) - matches the frontend's bulkUpdateProperties optimistic update,
    # which appends to the existing array rather than replacing it. ---
    if "label_ids" in properties:
        label_ids = list({str(lid) for lid in (properties.get("label_ids") or [])})
        existing_pairs = set(
            IssueLabel.objects.filter(issue_id__in=issues_by_id.keys(), label_id__in=label_ids).values_list(
                "issue_id", "label_id"
            )
        )
        IssueLabel.objects.bulk_create(
            [
                IssueLabel(
                    issue_id=issue_id, label_id=label_id, project_id=project_id, workspace_id=project.workspace_id
                )
                for issue_id in issues_by_id.keys()
                for label_id in label_ids
                if (issue_id, label_id) not in existing_pairs
            ],
            batch_size=100,
            ignore_conflicts=True,
        )
        enforce_label_group_exclusivity(list(issues_by_id.keys()), label_ids)
        for issue_id in issues_by_id.keys():
            succeeded_fields[issue_id].append("label_ids")
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps({"label_ids": label_ids}),
                current_instance=json.dumps({}),
                issue_id=issue_id,
                actor_id=actor_id,
                project_id=str(project_id),
                epoch=epoch,
            )

    # --- Assignees: additive, same rationale as labels above. ---
    if "assignee_ids" in properties:
        assignee_ids = list({str(aid) for aid in (properties.get("assignee_ids") or [])})
        existing_pairs = set(
            IssueAssignee.objects.filter(issue_id__in=issues_by_id.keys(), assignee_id__in=assignee_ids).values_list(
                "issue_id", "assignee_id"
            )
        )
        IssueAssignee.objects.bulk_create(
            [
                IssueAssignee(
                    issue_id=issue_id, assignee_id=assignee_id, project_id=project_id, workspace_id=project.workspace_id
                )
                for issue_id in issues_by_id.keys()
                for assignee_id in assignee_ids
                if (issue_id, assignee_id) not in existing_pairs
            ],
            batch_size=100,
            ignore_conflicts=True,
        )
        for issue_id in issues_by_id.keys():
            succeeded_fields[issue_id].append("assignee_ids")
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps({"assignee_ids": assignee_ids}),
                current_instance=json.dumps({}),
                issue_id=issue_id,
                actor_id=actor_id,
                project_id=str(project_id),
                epoch=epoch,
            )

    # --- Cycle: remove from current active cycle, add to new one; reject
    # per-issue (not whole batch) if the target cycle is already completed ---
    if "cycle_id" in properties:
        cycle_id = properties.get("cycle_id")
        target_cycle = Cycle.objects.filter(workspace__slug=slug, project_id=project_id, pk=cycle_id).first()
        if not target_cycle:
            for issue_id in issues_by_id.keys():
                failed[issue_id].append("Target cycle not found")
        elif target_cycle.end_date is not None and target_cycle.end_date < timezone.now():
            for issue_id in issues_by_id.keys():
                failed[issue_id].append("Target cycle is already completed")
        else:
            existing_cycle_issues = list(CycleIssue.objects.filter(issue_id__in=issues_by_id.keys()))
            by_issue = {str(ci.issue_id): ci for ci in existing_cycle_issues}
            to_update, to_create = [], []
            for issue_id in issues_by_id.keys():
                current = by_issue.get(issue_id)
                if current is None:
                    to_create.append(
                        CycleIssue(
                            project_id=project_id,
                            workspace_id=project.workspace_id,
                            created_by_id=request.user.id,
                            updated_by_id=request.user.id,
                            cycle_id=cycle_id,
                            issue_id=issue_id,
                        )
                    )
                elif str(current.cycle_id) != str(cycle_id):
                    current.cycle_id = cycle_id
                    to_update.append(current)
                succeeded_fields[issue_id].append("cycle_id")
            if to_create:
                CycleIssue.objects.bulk_create(to_create, batch_size=100)
            if to_update:
                CycleIssue.objects.bulk_update(to_update, ["cycle_id"], batch_size=100)
            issue_activity.delay(
                type="cycle.activity.created",
                requested_data=json.dumps({"cycles_list": list(issues_by_id.keys())}),
                actor_id=actor_id,
                issue_id=None,
                project_id=str(project_id),
                current_instance=json.dumps({"cycle_id": str(cycle_id)}),
                epoch=epoch,
                notification=True,
                origin=base_host(request=request, is_app=True),
            )

    # --- Modules: additive, an issue may belong to several modules ---
    if "module_ids" in properties:
        module_ids = list({str(mid) for mid in (properties.get("module_ids") or [])})
        valid_module_ids = set(
            str(m)
            for m in Module.objects.filter(workspace__slug=slug, project_id=project_id, pk__in=module_ids).values_list(
                "id", flat=True
            )
        )
        invalid_module_ids = set(module_ids) - valid_module_ids
        if invalid_module_ids:
            for issue_id in issues_by_id.keys():
                failed[issue_id].append(f"Unknown module(s): {', '.join(invalid_module_ids)}")
        if valid_module_ids:
            ModuleIssue.objects.bulk_create(
                [
                    ModuleIssue(
                        issue_id=issue_id,
                        module_id=module_id,
                        project_id=project_id,
                        workspace_id=project.workspace_id,
                        created_by_id=request.user.id,
                        updated_by_id=request.user.id,
                    )
                    for issue_id in issues_by_id.keys()
                    for module_id in valid_module_ids
                ],
                batch_size=100,
                ignore_conflicts=True,
            )
            for issue_id in issues_by_id.keys():
                succeeded_fields[issue_id].append("module_ids")
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"module_ids": list(valid_module_ids)}),
                    current_instance=json.dumps({}),
                    issue_id=issue_id,
                    actor_id=actor_id,
                    project_id=str(project_id),
                    epoch=epoch,
                )

    result = {
        "success": [{"id": issue_id, "fields": fields} for issue_id, fields in succeeded_fields.items() if fields],
        "failed": [{"id": issue_id, "reasons": reasons} for issue_id, reasons in failed.items() if reasons],
        "pending_approval": [
            {"id": issue_id, "reasons": reasons} for issue_id, reasons in pending_approval.items() if reasons
        ],
    }
    any_failed = any(reasons for reasons in failed.values())
    any_pending = any(reasons for reasons in pending_approval.values())
    any_succeeded = any(fields for fields in succeeded_fields.values())
    if any_succeeded and not any_failed and not any_pending:
        operation.status = BulkIssueOperation.OperationStatus.COMPLETED
    elif any_failed and not any_succeeded and not any_pending:
        operation.status = BulkIssueOperation.OperationStatus.FAILED
    elif any_pending and not any_succeeded and not any_failed:
        operation.status = BulkIssueOperation.OperationStatus.PENDING
    else:
        operation.status = BulkIssueOperation.OperationStatus.PARTIAL
    operation.result = result
    operation.save(update_fields=["status", "result"])

    return Response(
        {"bulk_operation_id": str(operation.id), **result},
        status=status.HTTP_200_OK,
    )


class BulkIssueOperationsEndpoint(BaseAPIView):
    """
    Session-authenticated (web UI) entry point for `bulk_issue_operations` -
    see that function's docstring for the actual batch-update behavior.
    """

    MAX_BATCH_SIZE = BULK_OPERATIONS_MAX_BATCH_SIZE

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        return bulk_issue_operations(request, slug, project_id)


class IssueMetaEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.issue_objects.only("sequence_id", "project__identifier").get(
            id=issue_id, project_id=project_id, workspace__slug=slug
        )
        return Response(
            {
                "sequence_id": issue.sequence_id,
                "project_identifier": issue.project.identifier,
            },
            status=status.HTTP_200_OK,
        )


class IssueDetailIdentifierEndpoint(BaseAPIView):
    def strict_str_to_int(self, s):
        if not s.isdigit() and not (s.startswith("-") and s[1:].isdigit()):
            raise ValueError("Invalid integer string")
        return int(s)

    def get(self, request, slug, project_identifier, issue_identifier):
        # Check if the issue identifier is a valid integer
        try:
            issue_identifier = self.strict_str_to_int(issue_identifier)
        except ValueError:
            return Response(
                {"error": "Invalid issue identifier"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fetch the project
        project = Project.objects.get(identifier__iexact=project_identifier, workspace__slug=slug)

        # Check if the user is a member of the project
        if not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project.id,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Fetch the issue
        issue = (
            Issue.objects.filter(project_id=project.id)
            .filter(workspace__slug=slug)
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels", "issue_module__module")
            .annotate(cycle_id=Subquery(CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[:1]))
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .filter(sequence_id=issue_identifier)
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(~Q(labels__id__isnull=True) & Q(label_issue__deleted_at__isnull=True)),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    ArrayAgg(
                        "issue_module__module_id",
                        distinct=True,
                        filter=Q(
                            ~Q(issue_module__module_id__isnull=True)
                            & Q(issue_module__module__archived_at__isnull=True)
                            & Q(issue_module__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .prefetch_related(
                Prefetch(
                    "issue_reactions",
                    queryset=IssueReaction.objects.select_related("issue", "actor"),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_link",
                    queryset=IssueLink.objects.select_related("created_by"),
                )
            )
            .annotate(
                is_subscribed=Exists(
                    IssueSubscriber.objects.filter(
                        workspace__slug=slug,
                        project_id=project.id,
                        issue__sequence_id=issue_identifier,
                        subscriber=request.user,
                    )
                )
            )
            .annotate(
                is_intake=Exists(
                    IntakeIssue.objects.filter(
                        issue=OuterRef("id"),
                        status__in=[-2, 0],
                        workspace__slug=slug,
                        project_id=project.id,
                    )
                )
            )
        ).first()

        # Check if the issue exists
        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the issue
        """

        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project.id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not issue.created_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        recent_visited_task.delay(
            slug=slug,
            entity_name="issue",
            entity_identifier=str(issue.id),
            user_id=str(request.user.id),
            project_id=str(project.id),
        )

        # Serialize the issue
        serializer = IssueDetailSerializer(issue, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)
