# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    PageTemplateViewSet,
    PageTemplateDuplicateEndpoint,
    PageSaveAsTemplateEndpoint,
    PageTemplateCreatePageEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/page-templates/",
        PageTemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="page-template",
    ),
    path(
        "workspaces/<str:slug>/page-templates/<uuid:pk>/",
        PageTemplateViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="page-template",
    ),
    path(
        "workspaces/<str:slug>/page-templates/<uuid:pk>/duplicate/",
        PageTemplateDuplicateEndpoint.as_view(),
        name="page-template-duplicate",
    ),
    path(
        "workspaces/<str:slug>/page-templates/<uuid:pk>/create-page/",
        PageTemplateCreatePageEndpoint.as_view(),
        name="page-template-create-page",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/save-as-template/",
        PageSaveAsTemplateEndpoint.as_view(),
        name="page-save-as-template",
    ),
]
