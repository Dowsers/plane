# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    RecurringIssueTemplateViewSet,
    RecurringIssueTemplatePauseEndpoint,
    RecurringIssueTemplateResumeEndpoint,
    RecurringIssueTemplateGenerateNowEndpoint,
    RecurringIssueTemplateGeneratedIssuesEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issue-templates/",
        RecurringIssueTemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="recurring-issue-template",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issue-templates/<uuid:pk>/",
        RecurringIssueTemplateViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="recurring-issue-template",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issue-templates/<uuid:pk>/pause/",
        RecurringIssueTemplatePauseEndpoint.as_view(),
        name="recurring-issue-template-pause",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issue-templates/<uuid:pk>/resume/",
        RecurringIssueTemplateResumeEndpoint.as_view(),
        name="recurring-issue-template-resume",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issue-templates/<uuid:pk>/generate-now/",
        RecurringIssueTemplateGenerateNowEndpoint.as_view(),
        name="recurring-issue-template-generate-now",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issue-templates/<uuid:pk>/generated-issues/",
        RecurringIssueTemplateGeneratedIssuesEndpoint.as_view(),
        name="recurring-issue-template-generated-issues",
    ),
]
