# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Helpers for the View Subscriptions feature - see
docs/feature-specs/04-views-filters.md ("Abonnements/notifications par
vue") in plane-selfhost.
"""

from django.db.models import Q

from plane.db.models import Issue, IssueView, ViewSubscription
from plane.utils.filters import ComplexFilterBackend, IssueFilterSet


class _IssueFilterSetView:
    """Minimal stand-in for a DRF view, exposing only what
    ComplexFilterBackend needs (`filterset_class`) to evaluate a
    `rich_filters` tree outside of an actual HTTP request/response cycle.
    """

    filterset_class = IssueFilterSet


def issue_matches_view(issue_id, issue_view):
    """Check whether a single issue currently matches a saved view's
    filters, reusing the exact same tree evaluator (ComplexFilterBackend)
    that serves the view's own issue list - not a simplified/duplicated
    filter engine, per spec requirement 12. An empty/missing rich_filters
    tree matches every issue, consistent with ComplexFilterBackend's own
    behavior when no filter is supplied.
    """
    rich_filters = issue_view.rich_filters
    queryset = Issue.issue_objects.filter(workspace_id=issue_view.workspace_id)
    if not rich_filters:
        return queryset.filter(pk=issue_id).exists()

    backend = ComplexFilterBackend()
    combined_q = backend._evaluate_node(rich_filters, _IssueFilterSetView(), queryset)
    if combined_q is None:
        return queryset.filter(pk=issue_id).exists()
    return queryset.filter(pk=issue_id).filter(combined_q).exists()


def get_subscribed_views_for_issue(workspace_slug, project_id):
    """IssueViews that could plausibly contain an issue in this project:
    the project's own views, or workspace-scoped views (project is null) in
    the same workspace - restricted to views with at least one active
    subscription, since that's the only reason to ever check membership.
    """
    return (
        IssueView.objects.filter(workspace__slug=workspace_slug)
        .filter(Q(project_id=project_id) | Q(project__isnull=True))
        .filter(subscriptions__is_active=True)
        .distinct()
    )


def deactivate_user_view_subscriptions(subscriber_id, workspace_slug, project_id=None):
    """Deactivate a user's view subscriptions when they lose access - see
    spec requirement 10. If `project_id` is given, only subscriptions to
    that project's views are deactivated (a project-level removal);
    otherwise every subscription in the workspace is deactivated (a
    workspace-level removal, which already implies loss of every project
    membership too).
    """
    subscriptions = ViewSubscription.objects.filter(
        subscriber_id=subscriber_id,
        workspace__slug=workspace_slug,
        is_active=True,
    )
    if project_id is not None:
        subscriptions = subscriptions.filter(issue_view__project_id=project_id)
    subscriptions.update(is_active=False)
