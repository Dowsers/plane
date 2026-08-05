# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssueAllowedTransitionsEndpoint,
    IssueTransitionApprovalApproveEndpoint,
    IssueTransitionApprovalRejectEndpoint,
    IssueTransitionRequestApprovalEndpoint,
    WorkflowTransitionActionEndpoint,
    WorkflowTransitionApproverEndpoint,
    WorkflowTransitionAuditLogEndpoint,
    WorkflowTransitionConditionEndpoint,
    WorkflowTransitionViewSet,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/",
        WorkflowTransitionViewSet.as_view({"get": "list", "post": "create"}),
        name="workflow-transition",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/<uuid:pk>/",
        WorkflowTransitionViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workflow-transition",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/<uuid:pk>/approvers/",
        WorkflowTransitionApproverEndpoint.as_view(),
        name="workflow-transition-approver",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/<uuid:pk>/approvers/<uuid:approver_id>/",
        WorkflowTransitionApproverEndpoint.as_view(),
        name="workflow-transition-approver",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/<uuid:pk>/conditions/",
        WorkflowTransitionConditionEndpoint.as_view(),
        name="workflow-transition-condition",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/<uuid:pk>/conditions/<uuid:condition_id>/",
        WorkflowTransitionConditionEndpoint.as_view(),
        name="workflow-transition-condition",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/<uuid:pk>/actions/",
        WorkflowTransitionActionEndpoint.as_view(),
        name="workflow-transition-action",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/<uuid:pk>/actions/<uuid:action_id>/",
        WorkflowTransitionActionEndpoint.as_view(),
        name="workflow-transition-action",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-transition-audit-logs/",
        WorkflowTransitionAuditLogEndpoint.as_view(),
        name="workflow-transition-audit-log",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/allowed-transitions/",
        IssueAllowedTransitionsEndpoint.as_view(),
        name="issue-allowed-transitions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/transitions/<uuid:transition_id>/request-approval/",
        IssueTransitionRequestApprovalEndpoint.as_view(),
        name="issue-transition-request-approval",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-transition-approvals/<uuid:pk>/approve/",
        IssueTransitionApprovalApproveEndpoint.as_view(),
        name="issue-transition-approval-approve",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-transition-approvals/<uuid:pk>/reject/",
        IssueTransitionApprovalRejectEndpoint.as_view(),
        name="issue-transition-approval-reject",
    ),
]
