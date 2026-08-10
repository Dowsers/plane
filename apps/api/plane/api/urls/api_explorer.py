# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import APIExplorerSchemaEndpoint, APIExplorerEphemeralTokenEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/api-explorer/schema/",
        APIExplorerSchemaEndpoint.as_view(),
        name="api-explorer-schema",
    ),
    path(
        "workspaces/<str:slug>/api-explorer/tokens/ephemeral/",
        APIExplorerEphemeralTokenEndpoint.as_view(),
        name="api-explorer-ephemeral-token",
    ),
]
