# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Authenticated Sentry/Support-connector endpoints - see
docs/feature-specs/07-integrations-git.md ("5. Integration Sentry
native", "6. Pont support client type Zendesk/Front", "Considerations
API / UX") in plane-selfhost.
"""

from django.urls import path

from plane.app.views.integrations import (
    IssueSupportTicketViewSet,
    SentryConnectionEndpoint,
    SentryIntegrationLogsEndpoint,
    SentryProjectSyncViewSet,
    SupportConnectorRotateSecretEndpoint,
    SupportConnectorViewSet,
)

urlpatterns = [
    # --- Sentry ---
    path(
        "workspaces/<str:slug>/integrations/sentry/",
        SentryConnectionEndpoint.as_view(),
        name="sentry-connection",
    ),
    path(
        "workspaces/<str:slug>/integrations/sentry/logs/",
        SentryIntegrationLogsEndpoint.as_view(),
        name="sentry-integration-logs",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/sentry-sync/",
        SentryProjectSyncViewSet.as_view({"get": "list", "post": "create"}),
        name="sentry-project-sync",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/sentry-sync/<uuid:pk>/",
        SentryProjectSyncViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="sentry-project-sync",
    ),
    # --- Support connectors (Zendesk/Front/generic webhook) ---
    path(
        "workspaces/<str:slug>/support-connectors/",
        SupportConnectorViewSet.as_view({"get": "list", "post": "create"}),
        name="support-connector",
    ),
    path(
        "workspaces/<str:slug>/support-connectors/<uuid:pk>/",
        SupportConnectorViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="support-connector",
    ),
    path(
        "workspaces/<str:slug>/support-connectors/<uuid:pk>/rotate-secret/",
        SupportConnectorRotateSecretEndpoint.as_view(),
        name="support-connector-rotate-secret",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/support-tickets/",
        IssueSupportTicketViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-support-ticket",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/support-tickets/<uuid:pk>/",
        IssueSupportTicketViewSet.as_view({"delete": "destroy"}),
        name="issue-support-ticket",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/support-tickets/<uuid:pk>/refresh/",
        IssueSupportTicketViewSet.as_view({"post": "refresh"}),
        name="issue-support-ticket-refresh",
    ),
]
