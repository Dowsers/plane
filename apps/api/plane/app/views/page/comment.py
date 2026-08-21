# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), features 1+3 (merged) - "Commentaires ancres sur les
Pages" + "Resolution de fils de commentaires". Project-scoped only - the
workspace-scoped counterparts (`WorkspacePageCommentViewSet`/
`WorkspacePageCommentReactionViewSet`) live in
`plane.app.views.page.workspace` and subclass the two viewsets below,
exactly like `WorkspacePageReactionViewSet` already does for
`PageReactionViewSet`.

Mirrors `plane.app.views.page.reaction.PageReactionViewSet`'s own
docstring reasoning for using a dedicated `permission_classes` list instead
of the `@allow_permission` role decorator: a Page's own private/public/
owner access dimension can't be expressed by a plain project-role check.
See `PageCommentPermission`/`PageCommentReactionPermission`
(`plane.app.permissions.page`) for the exact role/read-access split, and
`plane.utils.page_comment` for the shared resolve/reopen/delete role
matrix and the locked/archived write-block helper used throughout this
file.
"""

# Django imports
from django.db import IntegrityError
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet
from plane.app.permissions import PageCommentPermission, PageCommentReactionPermission
from plane.app.serializers import (
    PageCommentCreateSerializer,
    PageCommentReactionSerializer,
    PageCommentSerializer,
)
from plane.db.models import Page, PageComment, PageCommentReaction
from plane.utils.error_codes import ERROR_CODES
from plane.utils.page_comment import can_user_moderate_page_comment_thread, page_comment_write_block_reason


def _write_block_response(page):
    """Shared by every create/reply/resolve/reopen action below (both
    scopes) - returns a 400 `Response` if the Page is locked or archived,
    else `None`. See `page_comment_write_block_reason`'s own docstring for
    the exact rule (decision from this feature's build brief).
    """
    reason = page_comment_write_block_reason(page)
    if reason:
        return Response(
            {"error_code": ERROR_CODES[reason], "error_message": reason},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


class PageCommentViewSet(BaseViewSet):
    serializer_class = PageCommentSerializer
    model = PageComment
    permission_classes = [PageCommentPermission]

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
            .select_related("actor", "resolved_by", "page")
            .order_by("created_at")
            .distinct()
        )

    def _get_page(self, slug, project_id, page_id):
        return Page.objects.get(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

    def list(self, request, slug, project_id, page_id):
        # Only thread roots are listed at the top level - each carries its
        # own replies nested via `PageCommentSerializer.get_replies`.
        queryset = self.get_queryset().filter(parent__isnull=True)

        resolved = request.query_params.get("resolved")
        if resolved is not None:
            queryset = queryset.filter(is_resolved=(resolved.lower() == "true"))

        orphaned = request.query_params.get("orphaned")
        if orphaned is not None:
            queryset = queryset.filter(is_orphaned=(orphaned.lower() == "true"))

        serializer = PageCommentSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug, project_id, page_id):
        page = self._get_page(slug, project_id, page_id)

        blocked = _write_block_response(page)
        if blocked is not None:
            return blocked

        serializer = PageCommentCreateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(page_id=page.id, workspace_id=page.workspace_id, actor=request.user, parent=None)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, project_id, page_id, pk):
        comment = self.get_queryset().filter(pk=pk).first()
        if comment is None:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = PageCommentSerializer(comment)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, slug, project_id, page_id, pk):
        comment = self.get_queryset().filter(pk=pk).first()
        if comment is None:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)

        # Feature 1 exigence 5 - only the comment's own author may edit
        # its text, regardless of Page ownership or admin role (that
        # broader trio is reserved for delete/resolve/reopen, see below).
        if comment.actor_id != request.user.id:
            return Response(
                {"error": "Only the comment's author can edit its text."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PageCommentSerializer(comment, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, project_id, page_id, pk):
        comment = self.get_queryset().filter(pk=pk).first()
        if comment is None:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)

        if not can_user_moderate_page_comment_thread(request.user, comment.page, comment, project_id=project_id):
            return Response(
                {"error": "Only the comment's author, the Page's owner, or a project Admin can delete it."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Soft-delete: `PageComment` inherits `BaseModel`/`SoftDeleteModel`,
        # so `.delete()` (plane.db.mixins.SoftDeleteModel.delete) already
        # fires `soft_delete_related_objects` (plane.bgtasks.deletion_task)
        # which recursively soft-deletes every CASCADE-related row - a
        # root's `replies` and any comment's `reactions` cascade for free,
        # satisfying exigence 5 ("supprimer le message racine supprime
        # l'ensemble du fil, y compris ses reponses") with zero bespoke
        # cascade logic here.
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def replies(self, request, slug, project_id, page_id, pk):
        # Restricted to a ROOT `pk` - this fork's comment model is a flat
        # two-level thread (root + replies), never nested replies-of-
        # replies (feature 1 exigence 3: a reply inherits the root's
        # anchor, it doesn't get to start a new one).
        thread = self.get_queryset().filter(pk=pk, parent__isnull=True).first()
        if thread is None:
            return Response({"error": "Thread not found"}, status=status.HTTP_404_NOT_FOUND)

        page = thread.page
        blocked = _write_block_response(page)
        if blocked is not None:
            return blocked

        serializer = PageCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                page_id=page.id,
                workspace_id=page.workspace_id,
                actor=request.user,
                parent=thread,
                anchor_id=None,
                anchor_text=None,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def resolve(self, request, slug, project_id, page_id, pk):
        return self._set_resolved(request, project_id, pk, resolved=True)

    def reopen(self, request, slug, project_id, page_id, pk):
        return self._set_resolved(request, project_id, pk, resolved=False)

    def _set_resolved(self, request, project_id, pk, resolved):
        thread = self.get_queryset().filter(pk=pk, parent__isnull=True).first()
        if thread is None:
            return Response({"error": "Thread not found"}, status=status.HTTP_404_NOT_FOUND)

        page = thread.page
        blocked = _write_block_response(page)
        if blocked is not None:
            return blocked

        if not can_user_moderate_page_comment_thread(request.user, page, thread, project_id=project_id):
            return Response(
                {
                    "error": "Only the thread's author, the Page's owner, or a project Admin "
                    "can resolve/reopen this thread."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        thread.is_resolved = resolved
        thread.resolved_by = request.user if resolved else None
        thread.resolved_at = timezone.now() if resolved else None
        thread.save()

        serializer = PageCommentSerializer(thread)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PageCommentReactionViewSet(BaseViewSet):
    """Mirrors `plane.app.views.page.reaction.PageReactionViewSet`
    field-for-field, scoped to a `PageComment` (root or reply) instead of
    a `Page` directly.
    """

    serializer_class = PageCommentReactionSerializer
    model = PageCommentReaction
    permission_classes = [PageCommentReactionPermission]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(comment_id=self.kwargs.get("comment_id"))
            .filter(
                comment__page_id=self.kwargs.get("page_id"),
                comment__page__projects__id=self.kwargs.get("project_id"),
                comment__page__project_pages__deleted_at__isnull=True,
                comment__page__projects__project_projectmember__member=self.request.user,
                comment__page__projects__project_projectmember__is_active=True,
                comment__page__projects__archived_at__isnull=True,
            )
            .order_by("-created_at")
            .distinct()
        )

    def create(self, request, slug, project_id, page_id, comment_id):
        comment = PageComment.objects.get(
            pk=comment_id,
            page_id=page_id,
            workspace__slug=slug,
            page__projects__id=project_id,
            page__project_pages__deleted_at__isnull=True,
        )
        serializer = PageCommentReactionSerializer(data=request.data)
        if serializer.is_valid():
            try:
                serializer.save(comment_id=comment.id, actor=request.user, workspace_id=comment.workspace_id)
            except IntegrityError:
                return Response(
                    {"error": "Reaction already exists for the user"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, project_id, page_id, comment_id, reaction_code):
        # Scoped to actor=request.user - a user may only remove their own
        # reaction, mirroring `PageReactionViewSet.destroy` (no admin/
        # moderation override in v1).
        reaction = PageCommentReaction.objects.get(
            workspace__slug=slug,
            comment_id=comment_id,
            comment__page_id=page_id,
            comment__page__projects__id=project_id,
            reaction=reaction_code,
            actor=request.user,
        )
        reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
