# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import RateLimitStatusEndpoint, APITokenRateLimitOverrideEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/rate-limit-status/",
        RateLimitStatusEndpoint.as_view(),
        name="rate-limit-status",
    ),
    path(
        "workspaces/<str:slug>/api-tokens/<uuid:pk>/rate-limit-override/",
        APITokenRateLimitOverrideEndpoint.as_view(),
        name="api-token-rate-limit-override",
    ),
]
