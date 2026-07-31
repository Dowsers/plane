# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.space.views import (
    IntakeIssuePublicViewSet,
    WorkspaceProjectDeployBoardEndpoint,
    IntakeFormPublicEndpoint,
    IntakeFormSubmitEndpoint,
    EmailInboundWebhookEndpoint,
    SlackEventsWebhookEndpoint,
    SlackInteractiveWebhookEndpoint,
)


urlpatterns = [
    path(
        "anchor/<str:anchor>/intakes/<uuid:intake_id>/intake-issues/",
        IntakeIssuePublicViewSet.as_view({"get": "list", "post": "create"}),
        name="intake-issue",
    ),
    path(
        "anchor/<str:anchor>/intakes/<uuid:intake_id>/inbox-issues/",
        IntakeIssuePublicViewSet.as_view({"get": "list", "post": "create"}),
        name="inbox-issue",
    ),
    path(
        "anchor/<str:anchor>/intakes/<uuid:intake_id>/intake-issues/<uuid:pk>/",
        IntakeIssuePublicViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="intake-issue",
    ),
    path(
        "workspaces/<str:slug>/project-boards/",
        WorkspaceProjectDeployBoardEndpoint.as_view(),
        name="workspace-project-boards",
    ),
    path(
        "intake-forms/<str:token>/",
        IntakeFormPublicEndpoint.as_view(),
        name="intake-form-public",
    ),
    path(
        "intake-forms/<str:token>/submit/",
        IntakeFormSubmitEndpoint.as_view(),
        name="intake-form-submit",
    ),
    path(
        "intake/email/inbound/",
        EmailInboundWebhookEndpoint.as_view(),
        name="intake-email-inbound",
    ),
    path(
        "integrations/slack/events/",
        SlackEventsWebhookEndpoint.as_view(),
        name="intake-slack-events",
    ),
    path(
        "integrations/slack/interactive/",
        SlackInteractiveWebhookEndpoint.as_view(),
        name="intake-slack-interactive",
    ),
]
