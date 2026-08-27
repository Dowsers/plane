# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
# feature 1 "Entite Customer et fiche client") in plane-selfhost.
#
# `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")` for
# list/create/read/update, `@allow_permission([ROLE.ADMIN],
# level="WORKSPACE")` for delete - the decorator-based pattern the spec's
# own "Considerations API/UX" section points to (`digest.py`,
# `integrations/sentry.py`, `figma.py`, `analytic/duration.py`), not the
# `WorkspaceEntityPermission` + manual-check mechanic `teamspace.py` uses
# (that endpoint is explicitly called out as NOT the model to follow here).
# Read access is opened further still to Guest (exigence 6 - "tout membre
# du workspace, y compris Guest").

# Django imports
from django.db.models import Count, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import CustomerListSerializer, CustomerSerializer
from plane.db.models import Customer, Workspace
from ..base import BaseViewSet


class CustomerViewSet(BaseViewSet):
    serializer_class = CustomerSerializer
    model = Customer

    def get_queryset(self):
        return (
            Customer.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace")
            .annotate(
                request_count=Count(
                    "customer_requests",
                    filter=Q(customer_requests__deleted_at__isnull=True),
                    distinct=True,
                )
            )
            .annotate(
                issue_count=Count(
                    "customer_requests__customer_request_issues__issue",
                    filter=Q(
                        customer_requests__deleted_at__isnull=True,
                        customer_requests__customer_request_issues__deleted_at__isnull=True,
                    ),
                    distinct=True,
                )
            )
        )

    def _apply_filters_and_ordering(self, request, queryset):
        # Exigence 8 - filterable by status, sortable by name / created_at /
        # request_count.
        status_filter = request.GET.get("status")
        if status_filter:
            queryset = queryset.filter(status__in=[s.strip() for s in status_filter.split(",") if s.strip()])

        search = request.GET.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        order_by = request.GET.get("order_by", "-created_at")
        allowed_order_fields = {"name", "-name", "created_at", "-created_at", "request_count", "-request_count"}
        if order_by not in allowed_order_fields:
            order_by = "-created_at"
        return queryset.order_by(order_by)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        queryset = self._apply_filters_and_ordering(request, self.get_queryset())
        serializer = CustomerListSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = CustomerSerializer(data=request.data, context={"workspace_id": workspace.id})
        if serializer.is_valid():
            serializer.save(workspace=workspace)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        customer = self.get_queryset().filter(pk=pk).first()
        if customer is None:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = CustomerListSerializer(customer)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        try:
            customer = Customer.objects.get(pk=pk, workspace__slug=slug)
        except Customer.DoesNotExist:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = CustomerSerializer(
            customer, data=request.data, partial=True, context={"workspace_id": customer.workspace_id}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # Exigence 5 - deletion is Admin-only (stricter than create/update).
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        try:
            customer = Customer.objects.get(pk=pk, workspace__slug=slug)
        except Customer.DoesNotExist:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)
        # Exigence 7 - soft-delete cascades to CustomerRequest (and, from
        # there, to CustomerRequestIssue) automatically via
        # `SoftDeleteModel.delete()` -> `soft_delete_related_objects`
        # (`plane/bgtasks/deletion_task.py`), which recursively walks every
        # CASCADE reverse relation - same mechanism already relied on for
        # every other soft-deletable model in this codebase, never touches
        # the linked work items themselves.
        customer.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
