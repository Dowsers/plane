# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    IntakeViewSet,
    IntakeIssueViewSet,
    IntakeWorkItemDescriptionVersionEndpoint,
    IntakeResponsibilitySettingEndpoint,
    IntakeRotationMemberViewSet,
    IntakeRotationMemberReorderEndpoint,
    TriageRuleViewSet,
    TriageRuleReorderEndpoint,
    TriageRuleDryRunEndpoint,
    TriageRuleReapplyEndpoint,
    IntakeFormViewSet,
    IntakeFormRegenerateTokenEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intakes/",
        IntakeViewSet.as_view({"get": "list", "post": "create"}),
        name="intake",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intakes/<uuid:pk>/",
        IntakeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="intake",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-issues/",
        IntakeIssueViewSet.as_view({"get": "list", "post": "create"}),
        name="intake-issue",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-issues/<uuid:pk>/",
        IntakeIssueViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="intake-issue",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inboxes/",
        IntakeViewSet.as_view({"get": "list", "post": "create"}),
        name="inbox",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inboxes/<uuid:pk>/",
        IntakeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="inbox",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inbox-issues/",
        IntakeIssueViewSet.as_view({"get": "list", "post": "create"}),
        name="inbox-issue",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inbox-issues/<uuid:pk>/",
        IntakeIssueViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="inbox-issue",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-work-items/<uuid:work_item_id>/description-versions/",
        IntakeWorkItemDescriptionVersionEndpoint.as_view(),
        name="intake-work-item-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-work-items/<uuid:work_item_id>/description-versions/<uuid:pk>/",
        IntakeWorkItemDescriptionVersionEndpoint.as_view(),
        name="intake-work-item-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-responsibility/",
        IntakeResponsibilitySettingEndpoint.as_view(),
        name="intake-responsibility",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-responsibility/rotation-members/",
        IntakeRotationMemberViewSet.as_view({"get": "list", "post": "create"}),
        name="intake-responsibility-rotation-member",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-responsibility/rotation-members/<uuid:pk>/",
        IntakeRotationMemberViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="intake-responsibility-rotation-member",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-responsibility/rotation-members/reorder/",
        IntakeRotationMemberReorderEndpoint.as_view(),
        name="intake-responsibility-rotation-member-reorder",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/triage-rules/",
        TriageRuleViewSet.as_view({"get": "list", "post": "create"}),
        name="triage-rule",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/triage-rules/<uuid:pk>/",
        TriageRuleViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="triage-rule",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/triage-rules/reorder/",
        TriageRuleReorderEndpoint.as_view(),
        name="triage-rule-reorder",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/triage-rules/<uuid:pk>/dry-run/",
        TriageRuleDryRunEndpoint.as_view(),
        name="triage-rule-dry-run",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/triage-rules/reapply/",
        TriageRuleReapplyEndpoint.as_view(),
        name="triage-rule-reapply",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-forms/",
        IntakeFormViewSet.as_view({"get": "list", "post": "create"}),
        name="intake-form",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-forms/<uuid:pk>/",
        IntakeFormViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="intake-form",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-forms/<uuid:pk>/regenerate-token/",
        IntakeFormRegenerateTokenEndpoint.as_view(),
        name="intake-form-regenerate-token",
    ),
]
