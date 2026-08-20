# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    AIChangeProposalApproveEndpoint,
    AIChangeProposalListEndpoint,
    AIChangeProposalRejectEndpoint,
    AIConversationDetailEndpoint,
    AIConversationListCreateEndpoint,
    AIConversationMessageListCreateEndpoint,
    ProjectAIAssistantConfigEndpoint,
    WorkspaceAIAssistantConfigEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/ai-conversations/",
        AIConversationListCreateEndpoint.as_view(),
        name="ai-conversations",
    ),
    path(
        "workspaces/<str:slug>/ai-conversations/<uuid:pk>/",
        AIConversationDetailEndpoint.as_view(),
        name="ai-conversation-detail",
    ),
    path(
        "workspaces/<str:slug>/ai-conversations/<uuid:pk>/messages/",
        AIConversationMessageListCreateEndpoint.as_view(),
        name="ai-conversation-messages",
    ),
    path(
        "workspaces/<str:slug>/ai-proposals/",
        AIChangeProposalListEndpoint.as_view(),
        name="ai-proposals",
    ),
    path(
        "workspaces/<str:slug>/ai-proposals/<uuid:pk>/approve/",
        AIChangeProposalApproveEndpoint.as_view(),
        name="ai-proposal-approve",
    ),
    path(
        "workspaces/<str:slug>/ai-proposals/<uuid:pk>/reject/",
        AIChangeProposalRejectEndpoint.as_view(),
        name="ai-proposal-reject",
    ),
    path(
        "workspaces/<str:slug>/ai-assistant-config/",
        WorkspaceAIAssistantConfigEndpoint.as_view(),
        name="workspace-ai-assistant-config",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/ai-assistant-config/",
        ProjectAIAssistantConfigEndpoint.as_view(),
        name="project-ai-assistant-config",
    ),
]
