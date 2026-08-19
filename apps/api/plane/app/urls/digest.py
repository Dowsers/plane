# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    UserDigestDetailEndpoint,
    UserDigestListEndpoint,
    UserDigestPreferenceEndpoint,
    UserDigestPreviewEndpoint,
    WorkspaceDigestSettingsEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/users/me/digest-preferences/",
        UserDigestPreferenceEndpoint.as_view(),
        name="user-digest-preferences",
    ),
    path(
        "workspaces/<str:slug>/users/me/digests/",
        UserDigestListEndpoint.as_view(),
        name="user-digests",
    ),
    path(
        "workspaces/<str:slug>/users/me/digests/preview/",
        UserDigestPreviewEndpoint.as_view(),
        name="user-digests-preview",
    ),
    path(
        "workspaces/<str:slug>/users/me/digests/<uuid:pk>/",
        UserDigestDetailEndpoint.as_view(),
        name="user-digest-detail",
    ),
    path(
        "workspaces/<str:slug>/digest-settings/",
        WorkspaceDigestSettingsEndpoint.as_view(),
        name="workspace-digest-settings",
    ),
]
