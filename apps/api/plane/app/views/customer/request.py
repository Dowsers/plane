# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
# feature 2 "CustomerRequest et liaison aux work items") in plane-selfhost.
#
# `CustomerRequestViewSet` - CRUD scoped to a single Customer, WORKSPACE-
# level Admin/Member permission (exigence 6, first half).
# `CustomerRequestIssueViewSet` - link/unlink a work item to/from a
# CustomerRequest; on top of the WORKSPACE-level Admin/Member check, ALSO
# verifies the requester is an active `ProjectMember` of the target issue's
# own project (exigence 6, second half - "l'appartenance au workspace ne
# suffit pas a garantir l'acces au projet de l'issue ciblee").

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    CustomerRequestDetailSerializer,
    CustomerRequestIssueSerializer,
    CustomerRequestSerializer,
    IssueCustomerRequestSerializer,
)
from plane.db.models import Customer, CustomerRequest, CustomerRequestIssue, Issue, ProjectMember
from ..base import BaseAPIView, BaseViewSet


class CustomerRequestViewSet(BaseViewSet):
    serializer_class = CustomerRequestSerializer
    model = CustomerRequest

    def get_queryset(self):
        queryset = CustomerRequest.objects.filter(
            workspace__slug=self.kwargs.get("slug"), customer_id=self.kwargs.get("customer_id")
        ).select_related("customer", "workspace")

        # Exigence 10 - filterable by presence/absence of a linked work item.
        has_issues = self.request.GET.get("has_issues")
        if has_issues is not None:
            linked_ids = CustomerRequestIssue.objects.filter(deleted_at__isnull=True).values_list(
                "customer_request_id", flat=True
            )
            if has_issues.lower() == "true":
                queryset = queryset.filter(id__in=linked_ids)
            elif has_issues.lower() == "false":
                queryset = queryset.exclude(id__in=linked_ids)

        return queryset.order_by("-created_at")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, customer_id):
        serializer = CustomerRequestDetailSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug, customer_id):
        try:
            customer = Customer.objects.get(pk=customer_id, workspace__slug=slug)
        except Customer.DoesNotExist:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = CustomerRequestSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(customer=customer, workspace=customer.workspace)
            return Response(
                CustomerRequestDetailSerializer(serializer.instance).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, customer_id, pk):
        customer_request = self.get_queryset().filter(pk=pk).first()
        if customer_request is None:
            return Response({"error": "Customer request not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(CustomerRequestDetailSerializer(customer_request).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, customer_id, pk):
        try:
            customer_request = CustomerRequest.objects.get(pk=pk, customer_id=customer_id, workspace__slug=slug)
        except CustomerRequest.DoesNotExist:
            return Response({"error": "Customer request not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = CustomerRequestSerializer(customer_request, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(CustomerRequestDetailSerializer(customer_request).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, customer_id, pk):
        try:
            customer_request = CustomerRequest.objects.get(pk=pk, customer_id=customer_id, workspace__slug=slug)
        except CustomerRequest.DoesNotExist:
            return Response({"error": "Customer request not found"}, status=status.HTTP_404_NOT_FOUND)
        # Exigence 7 - cascades (soft-delete) to CustomerRequestIssue links
        # only, via soft_delete_related_objects; never touches the issues
        # themselves (exigence 8).
        customer_request.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerRequestIssueViewSet(BaseAPIView):
    """`GET/POST .../requests/<request_id>/issues/` and `DELETE
    .../issues/<issue_id>/` - link/unlink a work item to/from a
    CustomerRequest (spec section 2, "Considerations API/UX")."""

    def _get_customer_request(self, slug, customer_id, request_id):
        return CustomerRequest.objects.filter(
            pk=request_id, customer_id=customer_id, workspace__slug=slug
        ).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, customer_id, request_id):
        customer_request = self._get_customer_request(slug, customer_id, request_id)
        if customer_request is None:
            return Response({"error": "Customer request not found"}, status=status.HTTP_404_NOT_FOUND)

        links = CustomerRequestIssue.objects.filter(customer_request=customer_request).select_related("issue")
        return Response(CustomerRequestIssueSerializer(links, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, customer_id, request_id):
        customer_request = self._get_customer_request(slug, customer_id, request_id)
        if customer_request is None:
            return Response({"error": "Customer request not found"}, status=status.HTTP_404_NOT_FOUND)

        issue_id = request.data.get("issue_id") or request.data.get("issue")
        if not issue_id:
            return Response({"error": "issue_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            issue = Issue.objects.get(pk=issue_id, workspace__slug=slug)
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 6 - the requester must have (at minimum) active
        # ProjectMember access to the target issue's own project; workspace
        # Admin/Member on the Customer side is not, by itself, enough.
        has_project_access = ProjectMember.objects.filter(
            project_id=issue.project_id, member=request.user, is_active=True
        ).exists()
        if not has_project_access:
            return Response(
                {"error": "You don't have access to the project of this work item."},
                status=status.HTTP_403_FORBIDDEN,
            )

        link, created = CustomerRequestIssue.objects.get_or_create(
            customer_request=customer_request,
            issue=issue,
            defaults={"project_id": issue.project_id, "workspace_id": customer_request.workspace_id},
        )
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(CustomerRequestIssueSerializer(link).data, status=response_status)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, customer_id, request_id, issue_id):
        customer_request = self._get_customer_request(slug, customer_id, request_id)
        if customer_request is None:
            return Response({"error": "Customer request not found"}, status=status.HTTP_404_NOT_FOUND)

        link = CustomerRequestIssue.objects.filter(customer_request=customer_request, issue_id=issue_id).first()
        if link is None:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)

        has_project_access = ProjectMember.objects.filter(
            project_id=link.project_id, member=request.user, is_active=True
        ).exists()
        if not has_project_access:
            return Response(
                {"error": "You don't have access to the project of this work item."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Exigence 5/8 - removes only the link, never the CustomerRequest
        # nor the Issue itself.
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueCustomerRequestsEndpoint(BaseAPIView):
    """`GET .../projects/<project_id>/issues/<issue_id>/customer-requests/`
    - mirror endpoint on the Issue side (spec section 2, "Considerations
    API/UX"), feeding the "Customer requests" sidebar block (section 3,
    exigence 6). PROJECT-level permission (standard issue read access),
    not WORKSPACE-level, since this is read from the issue's own context."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        links = CustomerRequestIssue.objects.filter(
            issue_id=issue_id, project_id=project_id, workspace__slug=slug
        ).select_related("customer_request", "customer_request__customer")
        return Response(IssueCustomerRequestSerializer(links, many=True).data, status=status.HTTP_200_OK)
