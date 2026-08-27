# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers") in
# plane-selfhost. Same style as `plane.app.serializers.project_template` -
# plain BaseSerializer, a compact *ListSerializer with annotated counts for
# the list surface, and a detail serializer nesting requests/issue links.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Customer, CustomerRequest, CustomerRequestIssue


class CustomerSerializer(BaseSerializer):
    """Write shape - create/update a Customer."""

    class Meta:
        model = Customer
        fields = [
            "id",
            "workspace",
            "name",
            "description",
            "logo_props",
            "contact_name",
            "contact_email",
            "domain",
            "status",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "workspace", "created_at", "updated_at", "created_by"]

    def validate(self, data):
        name = data.get("name")
        if name is not None:
            workspace_id = self.context["workspace_id"]
            existing = Customer.objects.filter(workspace_id=workspace_id, name__iexact=name)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError({"name": "A customer with this name already exists"})
        return data


class CustomerListSerializer(BaseSerializer):
    """Compact shape for the Customer list page - spec section 3, exigence
    2: logo/name/status/request_count/work item count, counts annotated on
    the queryset (`Count`) rather than computed per-row here."""

    request_count = serializers.IntegerField(read_only=True)
    issue_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "workspace",
            "name",
            "description",
            "logo_props",
            "contact_name",
            "contact_email",
            "domain",
            "status",
            "request_count",
            "issue_count",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = fields


class CustomerRequestIssueSerializer(BaseSerializer):
    """A work item linked to a CustomerRequest - spec section 2, exigence
    9: enough to render the link (id/sequence/name/state/project) without
    duplicating the full Issue payload. `project_identifier` is included
    alongside `project_id` since the frontend's work item links are always
    built from the project's short identifier (`generateWorkItemLink`),
    never the raw project id."""

    issue_id = serializers.PrimaryKeyRelatedField(source="issue", read_only=True)
    sequence_id = serializers.IntegerField(source="issue.sequence_id", read_only=True)
    name = serializers.CharField(source="issue.name", read_only=True)
    project_id = serializers.PrimaryKeyRelatedField(source="issue.project_id", read_only=True)
    project_identifier = serializers.CharField(source="issue.project.identifier", read_only=True)
    state_id = serializers.PrimaryKeyRelatedField(source="issue.state_id", read_only=True)

    class Meta:
        model = CustomerRequestIssue
        fields = [
            "id",
            "customer_request",
            "issue_id",
            "sequence_id",
            "name",
            "project_id",
            "project_identifier",
            "state_id",
            "created_at",
            "created_by",
        ]
        read_only_fields = fields


class CustomerRequestSerializer(BaseSerializer):
    """Write shape - create/update a CustomerRequest."""

    class Meta:
        model = CustomerRequest
        fields = [
            "id",
            "customer",
            "workspace",
            "name",
            "description",
            "requested_at",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "customer", "workspace", "created_at", "updated_at", "created_by"]


class CustomerRequestDetailSerializer(CustomerRequestSerializer):
    """Nests its linked work items - spec section 3, exigence 4."""

    issues = CustomerRequestIssueSerializer(source="customer_request_issues", many=True, read_only=True)

    class Meta(CustomerRequestSerializer.Meta):
        fields = CustomerRequestSerializer.Meta.fields + ["issues"]


class IssueCustomerRequestSerializer(BaseSerializer):
    """Mirror endpoint on the Issue side - spec section 2, "Considerations
    API/UX": `GET .../issues/<issue_id>/customer-requests/`. Surfaces the
    CustomerRequest together with its parent Customer's name, per exigence
    9 ("sans dupliquer le contenu de la demande, uniquement un lien vers la
    fiche Customer/CustomerRequest")."""

    customer_request_id = serializers.PrimaryKeyRelatedField(source="customer_request", read_only=True)
    customer_id = serializers.PrimaryKeyRelatedField(source="customer_request.customer_id", read_only=True)
    customer_name = serializers.CharField(source="customer_request.customer.name", read_only=True)
    request_name = serializers.CharField(source="customer_request.name", read_only=True)
    request_description = serializers.CharField(source="customer_request.description", read_only=True)

    class Meta:
        model = CustomerRequestIssue
        fields = [
            "id",
            "customer_request_id",
            "customer_id",
            "customer_name",
            "request_name",
            "request_description",
            "issue",
            "created_at",
        ]
        read_only_fields = fields
