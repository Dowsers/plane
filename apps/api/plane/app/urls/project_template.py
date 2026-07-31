# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    ProjectTemplateViewSet,
    ProjectTemplateDuplicateEndpoint,
    ProjectTemplateCreateProjectEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/project-templates/",
        ProjectTemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="project-template",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:pk>/",
        ProjectTemplateViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-template",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:pk>/duplicate/",
        ProjectTemplateDuplicateEndpoint.as_view(),
        name="project-template-duplicate",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:pk>/create-project/",
        ProjectTemplateCreateProjectEndpoint.as_view(),
        name="project-template-create-project",
    ),
]
