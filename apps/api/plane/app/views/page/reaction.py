# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10, feature 2 - "Reactions emoji sur les Pages". Project-scoped
only (see `plane.db.models.page_reaction.PageReaction`'s own module
docstring for why no workspace-level endpoint exists yet). Mirrors
`IssueReactionViewSet`/`CommentReactionViewSet`
(`plane.app.views.issue.reaction`/`comment`) closely, except:
  - `permission_classes = [PageReactionPermission]` instead of the
    `@allow_permission` role decorator those two use - a Page (unlike an
    Issue) has its own private/public/owner access dimension that a plain
    project-role check can't express. See `PageReactionPermission`'s own
    docstring (`plane.app.permissions.page`).
  - No `issue_activity.delay(...)`/webhook call on create/destroy - Pages
    have no equivalent generic activity-feed mechanism, and per this
    fork's own precedent (`IssueReaction`/`CommentReaction` fire no
    webhook event either despite `IssueComment` doing so), reactions stay
    silent.
"""

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet
from plane.app.permissions import PageReactionPermission
from plane.app.serializers import PageReactionSerializer
from plane.db.models import Page, PageReaction


class PageReactionViewSet(BaseViewSet):
    serializer_class = PageReactionSerializer
    model = PageReaction
    permission_classes = [PageReactionPermission]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"))
            .filter(
                page__projects__id=self.kwargs.get("project_id"),
                page__project_pages__deleted_at__isnull=True,
                page__projects__project_projectmember__member=self.request.user,
                page__projects__project_projectmember__is_active=True,
                page__projects__archived_at__isnull=True,
            )
            .order_by("-created_at")
            .distinct()
        )

    def create(self, request, slug, project_id, page_id):
        # Re-fetch the page (PageReactionPermission already validated read
        # access to it) purely to get its workspace_id - PageReaction hand-
        # writes its own `workspace` FK (see that model's docstring), it is
        # not auto-synced the way ProjectBaseModel's is.
        page = Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )
        serializer = PageReactionSerializer(data=request.data)
        if serializer.is_valid():
            try:
                serializer.save(page_id=page.id, actor=request.user, workspace_id=page.workspace_id)
            except IntegrityError:
                return Response(
                    {"error": "Reaction already exists for the user"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, project_id, page_id, reaction_code):
        # Scoped to actor=request.user - a user may only remove their own
        # reaction (exigence 4), no admin/moderation override in v1.
        page_reaction = PageReaction.objects.get(
            workspace__slug=slug,
            page_id=page_id,
            page__projects__id=project_id,
            page__project_pages__deleted_at__isnull=True,
            reaction=reaction_code,
            actor=request.user,
        )
        page_reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
