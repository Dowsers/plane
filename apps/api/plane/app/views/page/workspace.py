# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), feature 4 - "Wiki workspace en GA". Workspace-scoped
Page/PageCollection endpoints - the real gap this feature closes: `Page.
is_global` already existed, but no workspace-level Page endpoint existed
anywhere to reach a page with zero `ProjectPage` links (every pre-existing
Page URL is nested under `workspaces/<slug>/projects/<project_id>/pages/
...`, and `PageSerializer.create()` always requires a `project_id`).

Each view here deliberately mirrors the shape of its project-scoped
counterpart in `plane.app.views.page.base`/`.version`/`.reaction` action
for action, dropping the `project_id` requirement and the `ProjectPage`
bookkeeping, rather than trying to unify the two into one generic view -
same reasoning as `PageReactionViewSet`'s own docstring: a workspace Page
and a project Page are similar but not identical resources.
"""

import json
from datetime import datetime

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, IntegrityError
from django.db.models import Count, Exists, IntegerField, OuterRef, Q, Subquery, UUIDField, Value
from django.db.models.functions import Coalesce
from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    ROLE,
    WorkspacePagePermission,
    WorkspacePageReactionPermission,
    WorkspacePageCommentPermission,
    WorkspacePageCommentReactionPermission,
    allow_permission,
)
from plane.app.serializers import (
    PageBinaryUpdateSerializer,
    PageCollectionSerializer,
    PageCommentReactionSerializer,
    PageDetailSerializer,
    PageReactionSerializer,
    PageVersionDetailSerializer,
    PageVersionSerializer,
    WorkspacePageDetailSerializer,
    WorkspacePageSerializer,
)
from plane.bgtasks.page_transaction_task import page_transaction
from plane.bgtasks.page_version_task import track_page_version
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.db.models import (
    Page,
    PageCollection,
    PageComment,
    PageCommentReaction,
    PageLog,
    PageReaction,
    PageVersion,
    Project,
    ProjectMember,
    ProjectPage,
    UserFavorite,
    Workspace,
    WorkspaceMember,
)
from plane.utils.error_codes import ERROR_CODES
from plane.utils.page_collection import collection_descendant_ids, validate_collection_depth

from ..base import BaseAPIView, BaseViewSet
from .base import unarchive_archive_page_and_descendants
from .comment import PageCommentReactionViewSet, PageCommentViewSet
from .reaction import PageReactionViewSet

ADMIN = ROLE.ADMIN.value
MEMBER = ROLE.MEMBER.value


def get_descendant_page_ids(page_id):
    """All descendant Page ids (via the `parent` self-FK sub-page
    hierarchy), NOT including `page_id` itself. Mirrors the same
    WITH RECURSIVE shape `unarchive_archive_page_and_descendants`
    (`plane.app.views.page.base`) already uses for the same table - the
    sub-page tree has no depth cap (unlike `PageCollection`), so a
    recursive CTE is the only bounded-query-count option.
    """
    sql = """
    WITH RECURSIVE descendants AS (
        SELECT id FROM pages WHERE parent_id = %s
        UNION ALL
        SELECT pages.id FROM pages, descendants WHERE pages.parent_id = descendants.id
    )
    SELECT id FROM descendants;
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, [page_id])
        return [row[0] for row in cursor.fetchall()]


def compute_insert_sort_order(sibling_qs, after_id):
    """Shared linked-list-via-float-`sort_order` helper for the `reorder`
    actions below (exigence 9 - drag & drop within a level and across
    Collections). `sibling_qs` must already exclude the item being moved.
    Raises `ValueError` if `after_id` doesn't refer to one of the given
    siblings.
    """
    siblings = list(sibling_qs.order_by("sort_order", "-created_at").values_list("id", "sort_order"))

    if after_id is None:
        return siblings[0][1] - 10000 if siblings else Page.DEFAULT_SORT_ORDER

    for index, (sibling_id, sibling_sort_order) in enumerate(siblings):
        if str(sibling_id) == str(after_id):
            if index + 1 < len(siblings):
                return (sibling_sort_order + siblings[index + 1][1]) / 2
            return sibling_sort_order + 10000

    raise ValueError("after_id does not refer to an item in the target container.")


class WorkspacePageViewSet(BaseViewSet):
    serializer_class = WorkspacePageSerializer
    model = Page
    permission_classes = [WorkspacePagePermission]
    search_fields = ["name"]

    def get_queryset(self):
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_type="page",
            entity_identifier=OuterRef("pk"),
            workspace__slug=self.kwargs.get("slug"),
        )
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), is_global=True)
            .filter(parent__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=Page.PUBLIC_ACCESS))
            .select_related("workspace", "owned_by")
            .prefetch_related("labels")
            .annotate(is_favorite=Exists(subquery))
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "page_labels__label_id",
                        distinct=True,
                        filter=~Q(page_labels__label_id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                # A workspace Page has zero ProjectPage links by
                # definition - kept as an always-empty annotation purely
                # so the shared `PageSerializer.Meta.fields` (which lists
                # "project_ids") doesn't AttributeError on these rows.
                project_ids=Coalesce(
                    ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .annotate(
                # Category 10, features 1+3 (merged) - decision #11:
                # computed via annotation, not denormalized on `Page`.
                # Only thread ROOTS carry `is_resolved` (see
                # `PageComment.save()`), hence `parent__isnull=True`.
                unresolved_comment_count=Coalesce(
                    Subquery(
                        PageComment.objects.filter(page=OuterRef("id"), parent__isnull=True, is_resolved=False)
                        .values("page")
                        .annotate(count=Count("id"))
                        .values("count")[:1]
                    ),
                    Value(0),
                    output_field=IntegerField(),
                )
            )
            .order_by("-is_favorite", self.request.GET.get("order_by", "sort_order"), "-created_at")
            .distinct()
        )

    def list(self, request, slug):
        queryset = self.get_queryset()

        collection_id = request.GET.get("collection_id")
        if collection_id:
            queryset = queryset.filter(collection_id=collection_id)

        label_id = request.GET.get("label_id")
        if label_id:
            queryset = queryset.filter(labels__id=label_id)

        favorite = request.GET.get("favorite")
        if favorite is not None:
            queryset = queryset.filter(is_favorite=(favorite.lower() == "true"))

        archived = request.GET.get("archived")
        if archived is not None:
            if archived.lower() == "true":
                queryset = queryset.filter(archived_at__isnull=False)
            else:
                queryset = queryset.filter(archived_at__isnull=True)

        pages = WorkspacePageSerializer(queryset, many=True).data
        return Response(pages, status=status.HTTP_200_OK)

    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        collection_id = request.data.get("collection_id") or None

        if collection_id:
            if not PageCollection.objects.filter(pk=collection_id, workspace=workspace).exists():
                return Response({"error": "Collection not found."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Root creation (exigence 4) - ADMIN always allowed; MEMBER
            # only when the workspace hasn't restricted root creation to
            # admins. Creating *inside* an existing Collection (the
            # `collection_id` branch above) only ever needs the ordinary
            # ADMIN/MEMBER access this action already requires via
            # `WorkspacePagePermission`.
            if workspace.wiki_root_creation_role == Workspace.WIKI_ROOT_CREATION_ADMIN:
                is_admin = WorkspaceMember.objects.filter(
                    member=request.user,
                    workspace=workspace,
                    is_active=True,
                    role=ADMIN,
                ).exists()
                if not is_admin:
                    return Response(
                        {"error": "Only workspace admins can create pages at the Wiki root."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

        serializer = WorkspacePageSerializer(
            data=request.data,
            context={
                "workspace_id": workspace.id,
                "owned_by_id": request.user.id,
                "collection_id": collection_id,
                "description_json": request.data.get("description_json", {}),
                "description_binary": request.data.get("description_binary", None),
                "description_html": request.data.get("description_html", "<p></p>"),
            },
        )

        if serializer.is_valid():
            serializer.save()
            page_transaction.delay(
                new_description_html=request.data.get("description_html", "<p></p>"),
                old_description_html=None,
                page_id=serializer.data["id"],
            )
            page = self.get_queryset().get(pk=serializer.data["id"])
            serializer = WorkspacePageDetailSerializer(page)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, page_id):
        page = self.get_queryset().filter(pk=page_id).first()
        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        track_visit = request.query_params.get("track_visit", "true").lower() == "true"
        issue_ids = PageLog.objects.filter(page_id=page_id, entity_name="issue").values_list(
            "entity_identifier", flat=True
        )
        data = WorkspacePageDetailSerializer(page).data
        data["issue_ids"] = issue_ids
        if track_visit:
            recent_visited_task.delay(
                slug=slug,
                entity_name="page",
                entity_identifier=page_id,
                user_id=request.user.id,
                project_id=None,
            )
        return Response(data, status=status.HTTP_200_OK)

    def partial_update(self, request, slug, page_id):
        try:
            page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)
        except Page.DoesNotExist:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.is_locked:
            return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

        parent = request.data.get("parent", None)
        if parent:
            _ = Page.objects.get(pk=parent, workspace__slug=slug, is_global=True)

        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = WorkspacePageDetailSerializer(page, data=request.data, partial=True)
        page_description = page.description_html
        if serializer.is_valid():
            serializer.save()
            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=page_description,
                    page_id=page_id,
                )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if page.archived_at is None:
            return Response(
                {"error": "The page should be archived before deleting"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.owned_by_id != request.user.id and (
            not WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, role=ADMIN, is_active=True
            ).exists()
        ):
            return Response(
                {"error": "Only admin or owner can delete the page"},
                status=status.HTTP_403_FORBIDDEN,
            )

        _ = Page.objects.filter(parent_id=page_id, workspace__slug=slug, is_global=True).update(parent=None)

        page.delete()
        UserFavorite.objects.filter(
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def archive(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if (
            WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True, role__lte=MEMBER
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserFavorite.objects.filter(
            entity_type="page",
            entity_identifier=page_id,
            workspace__slug=slug,
        ).delete()

        unarchive_archive_page_and_descendants(page_id, datetime.now())

        return Response({"archived_at": str(datetime.now())}, status=status.HTTP_200_OK)

    def unarchive(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if (
            WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True, role__lte=MEMBER
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can un archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.parent_id and page.parent.archived_at:
            page.parent = None
            page.save(update_fields=["parent"])

        unarchive_archive_page_and_descendants(page_id, None)

        return Response(status=status.HTTP_204_NO_CONTENT)

    def lock(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)
        page.is_locked = True
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def unlock(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)
        page.is_locked = False
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def access(self, request, slug, page_id):
        access = request.data.get("access", 0)
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page.access = access
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def convert(self, request, slug, page_id):
        """Exigence 5 - "Deplacer vers le Wiki" / "Deplacer vers un
        projet". Always mutates the existing `Page` row in place (never
        delete+recreate), so `PageVersion` history, `UserFavorite`
        entries, and lock/archive state are preserved automatically.
        Cascades `is_global` (and the corresponding `ProjectPage` link
        change) to every descendant sub-page, per the empirical finding
        that a sub-page has its OWN independent `ProjectPage` row(s) -
        access does not derive from the ancestor chain in this codebase.

        Restricted to top-level pages (`parent_id is None`) - converting a
        page nested under a parent of the *other* scope would split the
        `parent` hierarchy across a global/project boundary with no
        defined semantics in this fork; move it out of its parent first.
        """
        page = Page.objects.filter(pk=page_id, workspace__slug=slug).first()
        if page is None:
            return Response({"error": "Page not found."}, status=status.HTTP_404_NOT_FOUND)

        if page.parent_id is not None:
            return Response(
                {"error": "Only a top-level page can be converted; move it out of its parent page first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target = request.data.get("target")
        if target not in ("global", "project"):
            return Response({"error": "target must be 'global' or 'project'."}, status=status.HTTP_400_BAD_REQUEST)

        project_id = request.data.get("project_id")
        if target == "project":
            if not project_id:
                return Response(
                    {"error": "project_id is required when target is 'project'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not Project.objects.filter(pk=project_id, workspace__slug=slug).exists():
                return Response({"error": "Project not found."}, status=status.HTTP_400_BAD_REQUEST)
            if not ProjectMember.objects.filter(project_id=project_id, member=request.user, is_active=True).exists():
                return Response(
                    {"error": "You are not a member of the destination project."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        descendant_ids = get_descendant_page_ids(page.id)
        all_ids = [page.id] + descendant_ids

        Page.objects.filter(id__in=all_ids).update(is_global=(target == "global"), collection=None)
        ProjectPage.objects.filter(page_id__in=all_ids).delete()

        if target == "project":
            ProjectPage.objects.bulk_create(
                [
                    ProjectPage(
                        workspace_id=page.workspace_id,
                        project_id=project_id,
                        page_id=pid,
                        created_by_id=request.user.id,
                        updated_by_id=request.user.id,
                    )
                    for pid in all_ids
                ]
            )

        page.refresh_from_db()
        if target == "global":
            serializer = WorkspacePageDetailSerializer(page)
        else:
            serializer = PageDetailSerializer(page)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def reorder(self, request, slug, page_id):
        """Exigence 9 - drag & drop within a level (same `collection_id`)
        and across Collections/root, via `after_id`/`collection_id`."""
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        after_id = request.data.get("after_id")
        collection_id = request.data.get("collection_id") or None
        if collection_id and not PageCollection.objects.filter(pk=collection_id, workspace__slug=slug).exists():
            return Response({"error": "Collection not found."}, status=status.HTTP_400_BAD_REQUEST)

        siblings = Page.objects.filter(
            workspace__slug=slug,
            is_global=True,
            parent__isnull=True,
            collection_id=collection_id,
        ).exclude(pk=page.id)

        try:
            new_sort_order = compute_insert_sort_order(siblings, after_id)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        page.collection_id = collection_id
        page.sort_order = new_sort_order
        page.save()

        return Response(WorkspacePageDetailSerializer(page).data, status=status.HTTP_200_OK)


class WorkspacePagesDescriptionViewSet(BaseViewSet):
    """Mirrors `PagesDescriptionViewSet` (`plane.app.views.page.base`).
    Load-bearing for `apps/live`'s new `WorkspacePageService` - this is
    the endpoint it calls to fetch/persist the Yjs binary document for a
    genuine workspace-level Page.
    """

    permission_classes = [WorkspacePagePermission]

    def retrieve(self, request, slug, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=Page.PUBLIC_ACCESS),
            pk=page_id,
            workspace__slug=slug,
            is_global=True,
        )
        binary_data = page.description_binary

        def stream_data():
            if binary_data:
                yield binary_data
            else:
                yield b""

        response = StreamingHttpResponse(stream_data(), content_type="application/octet-stream")
        response["Content-Disposition"] = 'attachment; filename="page_description.bin"'
        return response

    def partial_update(self, request, slug, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=Page.PUBLIC_ACCESS),
            pk=page_id,
            workspace__slug=slug,
            is_global=True,
        )

        if page.is_locked:
            return Response(
                {"error_code": ERROR_CODES["PAGE_LOCKED"], "error_message": "PAGE_LOCKED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.archived_at:
            return Response(
                {"error_code": ERROR_CODES["PAGE_ARCHIVED"], "error_message": "PAGE_ARCHIVED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_description_html = page.description_html
        existing_instance = json.dumps({"description_html": old_description_html}, cls=DjangoJSONEncoder)

        serializer = PageBinaryUpdateSerializer(page, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()

            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=old_description_html,
                    page_id=page_id,
                )

            track_page_version.delay(
                page_id=page_id,
                existing_instance=existing_instance,
                user_id=request.user.id,
            )
            return Response({"message": "Updated successfully"})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkspacePageVersionEndpoint(BaseAPIView):
    """Mirrors `PageVersionEndpoint` (`plane.app.views.page.version`)."""

    permission_classes = [WorkspacePagePermission]

    def get(self, request, slug, page_id, pk=None):
        if pk:
            page_version = PageVersion.objects.get(workspace__slug=slug, page_id=page_id, pk=pk)
            serializer = PageVersionDetailSerializer(page_version)
            return Response(serializer.data, status=status.HTTP_200_OK)
        page_versions = PageVersion.objects.filter(workspace__slug=slug, page_id=page_id)
        serializer = PageVersionSerializer(page_versions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspacePageReactionViewSet(PageReactionViewSet):
    """Category 10, feature 2's `PageReaction` model/serializer, exposed a
    second time at the workspace scope (the gap that feature's own README
    explicitly flagged as deferred to this feature). Reuses the exact
    same model/serializer; only the queryset/create/destroy are
    overridden to drop the `project_id` requirement.
    """

    permission_classes = [WorkspacePageReactionPermission]

    def get_queryset(self):
        return (
            super(PageReactionViewSet, self)
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"), page__is_global=True)
            .order_by("-created_at")
            .distinct()
        )

    def create(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)
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

    def destroy(self, request, slug, page_id, reaction_code):
        page_reaction = PageReaction.objects.get(
            workspace__slug=slug,
            page_id=page_id,
            page__is_global=True,
            reaction=reaction_code,
            actor=request.user,
        )
        page_reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspacePageCollectionViewSet(BaseViewSet):
    serializer_class = PageCollectionSerializer
    model = PageCollection

    def get_queryset(self):
        return self.filter_queryset(super().get_queryset().filter(workspace__slug=self.kwargs.get("slug")))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        serializer = PageCollectionSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        parent_id = request.data.get("parent")

        if not parent_id and workspace.wiki_root_creation_role == Workspace.WIKI_ROOT_CREATION_ADMIN:
            is_admin = WorkspaceMember.objects.filter(
                member=request.user, workspace=workspace, is_active=True, role=ADMIN
            ).exists()
            if not is_admin:
                return Response(
                    {"error": "Only workspace admins can create Collections at the Wiki root."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = PageCollectionSerializer(data=request.data, context={"workspace_id": workspace.id})
        if serializer.is_valid():
            serializer.save(workspace=workspace)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        collection = PageCollection.objects.get(pk=pk, workspace__slug=slug)
        serializer = PageCollectionSerializer(
            collection,
            data=request.data,
            partial=True,
            context={"workspace_id": collection.workspace_id},
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        """Exigence 7 - `cascade=false` (default) promotes direct
        children (sub-Collections AND pages) to this Collection's own
        parent (or the Wiki root); `cascade=true` soft-deletes the whole
        subtree, Collections and pages alike.
        """
        collection = PageCollection.objects.get(pk=pk, workspace__slug=slug)
        cascade = request.query_params.get("cascade", "false").lower() == "true"

        if cascade:
            collection_ids = {collection.id} | collection_descendant_ids(collection)

            direct_page_ids = list(
                Page.objects.filter(collection_id__in=collection_ids).values_list("id", flat=True)
            )
            page_ids = set(direct_page_ids)
            for direct_page_id in direct_page_ids:
                page_ids.update(get_descendant_page_ids(direct_page_id))

            if page_ids:
                # Detach any sub-page whose parent is being deleted but
                # who isn't itself in the deleted set (shouldn't normally
                # happen since descendants are already included above,
                # but mirrors PageViewSet.destroy's own defensive
                # orphan-prevention step).
                Page.objects.filter(parent_id__in=page_ids).exclude(id__in=page_ids).update(parent=None)
                Page.objects.filter(id__in=page_ids).delete()

            PageCollection.objects.filter(id__in=collection_ids).delete()
        else:
            PageCollection.objects.filter(parent_id=collection.id).update(parent_id=collection.parent_id)
            Page.objects.filter(collection_id=collection.id).update(collection_id=collection.parent_id)
            collection.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def reorder(self, request, slug, pk):
        """Exigence 9, Collection side. The `collection_id` payload key is
        used for both endpoints (per the spec's own uniform payload
        shape) - here it means "the new parent Collection" (a Collection
        being reparented under another container, mirroring how a Page's
        `collection_id` names the container it lives in).
        """
        collection = PageCollection.objects.get(pk=pk, workspace__slug=slug)

        after_id = request.data.get("after_id")
        parent_id = request.data.get("collection_id") or None

        new_parent = None
        if parent_id:
            new_parent = PageCollection.objects.filter(pk=parent_id, workspace__slug=slug).first()
            if new_parent is None:
                return Response({"error": "Collection not found."}, status=status.HTTP_400_BAD_REQUEST)
            if new_parent.id == collection.id:
                return Response(
                    {"error": "A Collection cannot be its own parent."}, status=status.HTTP_400_BAD_REQUEST
                )
            if new_parent.id in collection_descendant_ids(collection):
                return Response(
                    {"error": "A Collection cannot be moved under one of its own descendants."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            validate_collection_depth(new_parent=new_parent, existing_instance=collection)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        siblings = PageCollection.objects.filter(workspace__slug=slug, parent_id=parent_id).exclude(pk=collection.id)

        try:
            new_sort_order = compute_insert_sort_order(siblings, after_id)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        collection.parent_id = parent_id
        collection.sort_order = new_sort_order
        collection.save()

        return Response(PageCollectionSerializer(collection).data, status=status.HTTP_200_OK)


class WorkspacePageCommentViewSet(PageCommentViewSet):
    """Category 10, features 1+3 (merged) - `PageComment`/
    `PageCommentReaction`, exposed a second time at the workspace scope
    FROM THE START (unlike feature 2's `PageReaction`, which deliberately
    deferred its workspace URL until Wiki GA existed - Wiki GA has now
    already shipped as of feature 4, so there is no reason to defer here
    too - see this feature's own build brief). Reuses every model/
    serializer/helper unchanged; only the queryset and the small set of
    methods that build a `Page`/`project_id`-scoped lookup are overridden
    to drop the `project_id` requirement, exactly mirroring
    `WorkspacePageReactionViewSet`'s own relationship to
    `PageReactionViewSet`.

    Every other action (`retrieve`/`partial_update`/`destroy`/`replies`/
    `resolve`/`reopen`) is reached through the parent class's own
    implementation unchanged - each of those already resolves
    `self.get_queryset()` polymorphically (this subclass's override, not
    the parent's), so passing `project_id=None` through is enough to reuse
    every object-level lookup, authorization check
    (`can_user_moderate_page_comment_thread` correctly takes the workspace-
    Admin branch once `page.is_global` is true, regardless of
    `project_id`) and the locked/archived write-block helper unchanged.
    """

    permission_classes = [WorkspacePageCommentPermission]

    def get_queryset(self):
        return (
            super(PageCommentViewSet, self)
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"), page__is_global=True)
            .select_related("actor", "resolved_by", "page")
            .order_by("created_at")
            .distinct()
        )

    def _get_page(self, slug, project_id, page_id):
        # `project_id` is unused here - kept so this override's call
        # signature matches the parent class's private helper exactly.
        return Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

    def list(self, request, slug, page_id):
        return super().list(request, slug, None, page_id)

    def create(self, request, slug, page_id):
        return super().create(request, slug, None, page_id)

    def retrieve(self, request, slug, page_id, pk):
        return super().retrieve(request, slug, None, page_id, pk)

    def partial_update(self, request, slug, page_id, pk):
        return super().partial_update(request, slug, None, page_id, pk)

    def destroy(self, request, slug, page_id, pk):
        return super().destroy(request, slug, None, page_id, pk)

    def replies(self, request, slug, page_id, pk):
        return super().replies(request, slug, None, page_id, pk)

    def resolve(self, request, slug, page_id, pk):
        return super().resolve(request, slug, None, page_id, pk)

    def reopen(self, request, slug, page_id, pk):
        return super().reopen(request, slug, None, page_id, pk)


class WorkspacePageCommentReactionViewSet(PageCommentReactionViewSet):
    """Workspace-scope counterpart to `PageCommentReactionViewSet`,
    mirroring `WorkspacePageReactionViewSet`'s own relationship to
    `PageReactionViewSet`.
    """

    permission_classes = [WorkspacePageCommentReactionPermission]

    def get_queryset(self):
        return (
            super(PageCommentReactionViewSet, self)
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(comment_id=self.kwargs.get("comment_id"))
            .filter(comment__page_id=self.kwargs.get("page_id"), comment__page__is_global=True)
            .order_by("-created_at")
            .distinct()
        )

    def create(self, request, slug, page_id, comment_id):
        comment = PageComment.objects.get(
            pk=comment_id, page_id=page_id, workspace__slug=slug, page__is_global=True
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

    def destroy(self, request, slug, page_id, comment_id, reaction_code):
        reaction = PageCommentReaction.objects.get(
            workspace__slug=slug,
            comment_id=comment_id,
            comment__page_id=page_id,
            comment__page__is_global=True,
            reaction=reaction_code,
            actor=request.user,
        )
        reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
