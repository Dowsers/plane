# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10, feature 5 - "Abonnements/notifications par page".
Project-scoped only - the workspace-scoped counterpart
(`WorkspacePageSubscriptionViewSet`) lives in
`plane.app.views.page.workspace` and subclasses this viewset, exactly like
`WorkspacePageReactionViewSet` already does for `PageReactionViewSet`.

`permission_classes = [PageSubscriptionPermission]` instead of the
`@allow_permission` role decorator, same reasoning
`PageReactionPermission`'s own docstring gives: a Page's private/public/
owner access dimension can't be expressed by a plain project-role check.
"""

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet
from plane.app.permissions import PageSubscriptionPermission
from plane.app.serializers import PageSubscriberSerializer
from plane.db.models import Page, PageSubscriber


class PageSubscriptionViewSet(BaseViewSet):
    serializer_class = PageSubscriberSerializer
    model = PageSubscriber
    permission_classes = [PageSubscriptionPermission]

    def _get_page(self, slug, project_id, page_id):
        return Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

    def retrieve(self, request, slug, project_id, page_id):
        """`GET .../subscribe/` -> `{"subscribed": true|false}` (exigence
        12). A row with `unsubscribed_manually=True` counts as NOT
        currently subscribed even though the row itself still exists (the
        "frozen"/explicit-unsubscribe bookkeeping is invisible to this
        state check by design).
        """
        page = self._get_page(slug, project_id, page_id)
        subscribed = PageSubscriber.objects.filter(
            page=page, subscriber=request.user, unsubscribed_manually=False
        ).exists()
        return Response({"subscribed": subscribed}, status=status.HTTP_200_OK)

    def create(self, request, slug, project_id, page_id):
        """`POST .../subscribe/` (exigence 1/2). `PageSubscriptionPermission`
        already 403s if the requesting user lacks read access to a
        PRIVATE page (exigence 8) before this method ever runs.
        """
        page = self._get_page(slug, project_id, page_id)
        subscriber, created = PageSubscriber.objects.get_or_create(
            page=page,
            subscriber=request.user,
            defaults={
                "workspace_id": page.workspace_id,
                "subscribed_manually": True,
                "created_by": request.user,
                "updated_by": request.user,
            },
        )
        if not created and subscriber.unsubscribed_manually:
            # Re-subscribing explicitly after a prior explicit unsubscribe
            # is always allowed (exigence 4 only blocks the AUTOMATIC
            # re-subscribe-by-mention path, never a fresh deliberate click
            # of the bell icon).
            subscriber.unsubscribed_manually = False
            subscriber.subscribed_manually = True
            subscriber.updated_by = request.user
            subscriber.save(update_fields=["unsubscribed_manually", "subscribed_manually", "updated_by"])
        return Response({"subscribed": True}, status=status.HTTP_201_CREATED)

    def destroy(self, request, slug, project_id, page_id):
        """`DELETE .../subscribe/` (exigence 4) - flips
        `unsubscribed_manually` on the existing row rather than deleting
        it, so the "no auto-resubscribe-by-mention after an explicit
        unsubscribe" rule has a persistent flag to check going forward.
        Idempotent: a user who was never subscribed (or whose Page no
        longer exists) simply gets 204 with nothing to do - unsubscribing
        is always allowed regardless of current read access (exigence 9 -
        `PageSubscriptionPermission` deliberately does not gate DELETE on
        Page-level read access).
        """
        subscriber = PageSubscriber.objects.filter(page_id=page_id, subscriber=request.user).first()
        if subscriber is not None:
            subscriber.unsubscribed_manually = True
            subscriber.updated_by = request.user
            subscriber.save(update_fields=["unsubscribed_manually", "updated_by"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def subscribers(self, request, slug, project_id, page_id):
        """`GET .../subscribers/` (exigence 12) - visible to anyone who can
        read the Page (same `PageSubscriptionPermission` read gate as the
        subscribe-state GET above).
        """
        page = self._get_page(slug, project_id, page_id)
        subscribers = (
            PageSubscriber.objects.filter(page=page, unsubscribed_manually=False)
            .select_related("subscriber")
            .order_by("-created_at")
        )
        serializer = PageSubscriberSerializer(subscribers, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
