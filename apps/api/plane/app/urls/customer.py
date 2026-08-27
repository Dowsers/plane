# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    CustomerViewSet,
    CustomerRequestViewSet,
    CustomerRequestIssueViewSet,
    IssueCustomerRequestsEndpoint,
)

urlpatterns = [
    # Feature 1 - Customer CRUD
    path(
        "workspaces/<str:slug>/customers/",
        CustomerViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-customers",
    ),
    path(
        "workspaces/<str:slug>/customers/<uuid:pk>/",
        CustomerViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-customer-detail",
    ),
    # Feature 2 - CustomerRequest CRUD
    path(
        "workspaces/<str:slug>/customers/<uuid:customer_id>/requests/",
        CustomerRequestViewSet.as_view({"get": "list", "post": "create"}),
        name="customer-requests",
    ),
    path(
        "workspaces/<str:slug>/customers/<uuid:customer_id>/requests/<uuid:pk>/",
        CustomerRequestViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="customer-request-detail",
    ),
    # Feature 2 - CustomerRequest <-> Issue linking
    path(
        "workspaces/<str:slug>/customers/<uuid:customer_id>/requests/<uuid:request_id>/issues/",
        CustomerRequestIssueViewSet.as_view(),
        name="customer-request-issues",
    ),
    path(
        "workspaces/<str:slug>/customers/<uuid:customer_id>/requests/<uuid:request_id>/issues/<uuid:issue_id>/",
        CustomerRequestIssueViewSet.as_view(),
        name="customer-request-issue-detail",
    ),
    # Feature 2 - mirror endpoint on the Issue side
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/customer-requests/",
        IssueCustomerRequestsEndpoint.as_view(),
        name="issue-customer-requests",
    ),
]
