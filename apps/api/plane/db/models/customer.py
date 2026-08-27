# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

# Module imports
from .base import BaseModel
from .project import ProjectBaseModel

# docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
# feature 1 "Entite Customer et fiche client") in plane-selfhost.

CUSTOMER_STATUS_CHOICES = (
    ("active", "Active"),
    ("prospect", "Prospect"),
    ("churned", "Churned"),
)


class Customer(BaseModel):
    """
    Dedicated profile of a workspace's customer/account - see spec section
    1. Plain BaseModel + explicit `workspace` FK (not WorkspaceBaseModel),
    same reasoning as `ProjectTemplate` (`project_template.py:17-26`): a
    Customer does not itself belong to a single project, it is a
    cross-workspace object that work items reference *from*
    `CustomerRequest`, never the other way around.
    """

    workspace = models.ForeignKey(
        "db.Workspace", related_name="workspace_customers", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    contact_name = models.CharField(max_length=255, blank=True)
    contact_email = models.EmailField(blank=True)
    domain = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=CUSTOMER_STATUS_CHOICES, default="active")

    class Meta:
        unique_together = ["workspace", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "workspace",
                condition=Q(deleted_at__isnull=True),
                name="customer_unique_name_ci_per_workspace",
            )
        ]
        indexes = [
            models.Index(fields=["workspace"], name="customer_workspace_idx"),
        ]
        verbose_name = "Customer"
        verbose_name_plural = "Customers"
        db_table = "customers"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"


class CustomerRequest(BaseModel):
    """
    A concrete request/quote/need expressed by a Customer - see spec
    section 2. Plain BaseModel + explicit `workspace` FK, same reasoning as
    `Customer` above: the request itself belongs to no single project, only
    its links to work items (`CustomerRequestIssue`) are project-scoped.
    """

    customer = models.ForeignKey(Customer, related_name="customer_requests", on_delete=models.CASCADE)
    workspace = models.ForeignKey(
        "db.Workspace", related_name="workspace_customer_requests", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    requested_at = models.DateField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["customer"], name="customer_request_customer_idx"),
        ]
        verbose_name = "Customer Request"
        verbose_name_plural = "Customer Requests"
        db_table = "customer_requests"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.customer_id}>"


class CustomerRequestIssue(ProjectBaseModel):
    """
    Pivot table linking a `CustomerRequest` to a work item (`Issue`) - see
    spec section 2, exigence 2. Inherits `ProjectBaseModel` (not
    `BaseModel`, unlike `Customer`/`CustomerRequest` above) because, unlike
    those two, this model carries a link to `Issue`, which IS
    project-scoped - `project`/`workspace` FKs come from `ProjectBaseModel`
    the same way they do for `IssueLabel`/`IssueRelation`
    (`project.py:313-322`), rather than being redeclared manually.

    The unique-constraint pattern mirrors `IssueRelation`
    (`issue.py:378-386`), not `IssueLabel` (which has none) - see spec
    exigence 4's note on this exact distinction.
    """

    customer_request = models.ForeignKey(
        CustomerRequest, related_name="customer_request_issues", on_delete=models.CASCADE
    )
    issue = models.ForeignKey("db.Issue", related_name="issue_customer_requests", on_delete=models.CASCADE)

    class Meta:
        unique_together = ["customer_request", "issue", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer_request", "issue"],
                condition=Q(deleted_at__isnull=True),
                name="customer_request_issue_unique_when_deleted_at_null",
            )
        ]
        indexes = [
            models.Index(fields=["customer_request", "issue"], name="customer_req_issue_idx"),
        ]
        verbose_name = "Customer Request Issue"
        verbose_name_plural = "Customer Request Issues"
        db_table = "customer_request_issues"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.customer_request_id} <{self.issue_id}>"
