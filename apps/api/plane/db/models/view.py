# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module import
from .workspace import WorkspaceBaseModel
from plane.utils.issue_filters import issue_filters


def get_default_filters():
    return {
        "priority": None,
        "state": None,
        "state_group": None,
        "assignees": None,
        "created_by": None,
        "labels": None,
        "start_date": None,
        "target_date": None,
        "subscriber": None,
    }


def get_default_display_filters():
    return {
        "group_by": None,
        "order_by": "-created_at",
        "type": None,
        "sub_issue": True,
        "show_empty_groups": True,
        "layout": "list",
        "calendar_date_range": "",
    }


def get_default_display_properties():
    return {
        "assignee": True,
        "attachment_count": True,
        "created_on": True,
        "due_date": True,
        "estimate": True,
        "key": True,
        "labels": True,
        "link": True,
        "priority": True,
        "start_date": True,
        "state": True,
        "sub_issue_count": True,
        "updated_on": True,
    }


class IssueView(WorkspaceBaseModel):
    name = models.CharField(max_length=255, verbose_name="View Name")
    description = models.TextField(verbose_name="View Description", blank=True)
    query = models.JSONField(verbose_name="View Query")
    filters = models.JSONField(default=dict)
    display_filters = models.JSONField(default=get_default_display_filters)
    display_properties = models.JSONField(default=get_default_display_properties)
    rich_filters = models.JSONField(default=dict)
    access = models.PositiveSmallIntegerField(default=1, choices=((0, "Private"), (1, "Public")))
    sort_order = models.FloatField(default=65535)
    logo_props = models.JSONField(default=dict)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="views")
    is_locked = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True)

    class Meta:
        verbose_name = "Issue View"
        verbose_name_plural = "Issue Views"
        db_table = "issue_views"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        query_params = self.filters
        self.query = issue_filters(query_params, "POST") if query_params else {}

        if self._state.adding:
            if self.project:
                largest_sort_order = IssueView.objects.filter(project=self.project).aggregate(
                    largest=models.Max("sort_order")
                )["largest"]
            else:
                largest_sort_order = IssueView.objects.filter(workspace=self.workspace, project__isnull=True).aggregate(
                    largest=models.Max("sort_order")
                )["largest"]
            if largest_sort_order is not None:
                self.sort_order = largest_sort_order + 10000

        super(IssueView, self).save(*args, **kwargs)

    def __str__(self):
        """Return name of the View"""
        return f"{self.name} <{self.project.name}>"


class ViewSubscription(WorkspaceBaseModel):
    """A personal subscription to a saved IssueView (project- or
    workspace-scoped, they're the same model - see IssueView above) - see
    docs/feature-specs/04-views-filters.md ("Abonnements/notifications par
    vue") in plane-selfhost. `workspace`/`project` are denormalized from
    `issue_view` at creation time for cheap scoped lookups (e.g. deactivating
    every subscription in a project when a member is removed) without a join.
    """

    issue_view = models.ForeignKey("db.IssueView", on_delete=models.CASCADE, related_name="subscriptions")
    subscriber = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="view_subscriptions"
    )
    notify_on_add = models.BooleanField(default=True)
    notify_on_complete = models.BooleanField(default=True)
    notify_on_cancel = models.BooleanField(default=True)
    notify_by_email = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ["issue_view", "subscriber", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue_view", "subscriber"],
                condition=models.Q(deleted_at__isnull=True),
                name="view_subscription_unique_view_subscriber_when_deleted_at_null",
            )
        ]
        verbose_name = "View Subscription"
        verbose_name_plural = "View Subscriptions"
        db_table = "view_subscriptions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.subscriber} -> {self.issue_view}"
