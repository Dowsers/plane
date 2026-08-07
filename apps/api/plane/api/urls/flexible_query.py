# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import FlexibleQueryEndpoint, FlexibleQuerySchemaEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/query/",
        FlexibleQueryEndpoint.as_view(),
        name="flexible-query",
    ),
    path(
        "workspaces/<str:slug>/query/schema/",
        FlexibleQuerySchemaEndpoint.as_view(),
        name="flexible-query-schema",
    ),
]
