# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    WorkflowRuleViewSet,
    WorkflowRuleToggleEndpoint,
    WorkflowRuleExecutionLogEndpoint,
    WorkflowRuleDuplicateEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-rules/",
        WorkflowRuleViewSet.as_view({"get": "list", "post": "create"}),
        name="workflow-rule",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-rules/<uuid:pk>/",
        WorkflowRuleViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workflow-rule",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-rules/<uuid:pk>/toggle/",
        WorkflowRuleToggleEndpoint.as_view(),
        name="workflow-rule-toggle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-rules/<uuid:pk>/execution-logs/",
        WorkflowRuleExecutionLogEndpoint.as_view(),
        name="workflow-rule-execution-log",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflow-rules/<uuid:pk>/duplicate/",
        WorkflowRuleDuplicateEndpoint.as_view(),
        name="workflow-rule-duplicate",
    ),
]
