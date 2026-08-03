# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ViewSubscriptionSerializer
from plane.db.models import IssueView, ViewSubscription
from .. import BaseAPIView


class ViewSubscriptionViewSet(BaseAPIView):
    """Singular per-user subscription resource on a saved view (project- or
    workspace-scoped - they're the same IssueView model) - see
    docs/feature-specs/04-views-filters.md ("Abonnements/notifications par
    vue") in plane-selfhost. A user has at most one subscription per view
    (enforced by a unique constraint), so this is a get/create/update/delete
    singular resource rather than a list.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, view_id):
        subscription = ViewSubscription.objects.filter(
            issue_view_id=view_id,
            subscriber=request.user,
            workspace__slug=slug,
            is_active=True,
        ).first()
        if subscription is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ViewSubscriptionSerializer(subscription).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, view_id):
        issue_view = IssueView.objects.filter(pk=view_id, workspace__slug=slug).first()
        if issue_view is None:
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)

        # A private view can only be subscribed to by its own owner - reuse
        # the exact same visibility rule already enforced when listing/
        # retrieving views (see IssueViewViewSet/WorkspaceViewViewSet).
        if issue_view.access == 0 and issue_view.owned_by_id != request.user.id:
            return Response({"error": "View not found"}, status=status.HTTP_404_NOT_FOUND)

        subscription, created = ViewSubscription.objects.update_or_create(
            issue_view=issue_view,
            subscriber=request.user,
            defaults={
                "workspace_id": issue_view.workspace_id,
                "project_id": issue_view.project_id,
                "is_active": True,
                "notify_on_add": request.data.get("notify_on_add", True),
                "notify_on_complete": request.data.get("notify_on_complete", True),
                "notify_on_cancel": request.data.get("notify_on_cancel", True),
                "notify_by_email": request.data.get("notify_by_email", False),
            },
        )
        return Response(
            ViewSubscriptionSerializer(subscription).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, view_id):
        subscription = ViewSubscription.objects.filter(
            issue_view_id=view_id, subscriber=request.user, workspace__slug=slug
        ).first()
        if subscription is None:
            return Response({"error": "Subscription not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ViewSubscriptionSerializer(subscription, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug, view_id):
        subscription = ViewSubscription.objects.filter(
            issue_view_id=view_id, subscriber=request.user, workspace__slug=slug
        ).first()
        if subscription is not None:
            subscription.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSubscriptionsEndpoint(BaseAPIView):
    """Consolidated "my subscriptions" list, across every project/view in
    the workspace - see spec requirement in the same section as above.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        subscriptions = ViewSubscription.objects.filter(
            subscriber=request.user, workspace__slug=slug, is_active=True
        ).select_related("issue_view")
        return self.paginate(
            order_by=request.GET.get("order_by", "-created_at"),
            request=request,
            queryset=subscriptions,
            on_results=lambda subs: ViewSubscriptionSerializer(subs, many=True).data,
        )
