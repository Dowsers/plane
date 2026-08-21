# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    PageViewSet,
    PageFavoriteViewSet,
    PagesDescriptionViewSet,
    PageVersionEndpoint,
    PageDuplicateEndpoint,
    PageReactionViewSet,
    PageCommentViewSet,
    PageCommentReactionViewSet,
    PageSubscriptionViewSet,
    WorkspacePageViewSet,
    WorkspacePagesDescriptionViewSet,
    WorkspacePageVersionEndpoint,
    WorkspacePageReactionViewSet,
    WorkspacePageCollectionViewSet,
    WorkspacePageCommentViewSet,
    WorkspacePageCommentReactionViewSet,
    WorkspacePageSubscriptionViewSet,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages-summary/",
        PageViewSet.as_view({"get": "summary"}),
        name="project-pages-summary",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/",
        PageViewSet.as_view({"get": "list", "post": "create"}),
        name="project-pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/",
        PageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-pages",
    ),
    # favorite pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/favorite-pages/<uuid:page_id>/",
        PageFavoriteViewSet.as_view({"post": "create", "delete": "destroy"}),
        name="user-favorite-pages",
    ),
    # archived pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/archive/",
        PageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="project-page-archive-unarchive",
    ),
    # lock and unlock
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/lock/",
        PageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="project-pages-lock-unlock",
    ),
    # private and public page
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/access/",
        PageViewSet.as_view({"post": "access"}),
        name="project-pages-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/description/",
        PagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="page-description",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/duplicate/",
        PageDuplicateEndpoint.as_view(),
        name="page-duplicate",
    ),
    # Page Reactions
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/reactions/",
        PageReactionViewSet.as_view({"get": "list", "post": "create"}),
        name="project-page-reactions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/reactions/<str:reaction_code>/",
        PageReactionViewSet.as_view({"delete": "destroy"}),
        name="project-page-reactions",
    ),
    ## End Page Reactions
    ## Page Comments (category 10, features 1+3 (merged) - "Commentaires
    ## ancres sur les Pages" + "Resolution de fils de commentaires")
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/",
        PageCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="project-page-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:pk>/",
        PageCommentViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-page-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:pk>/replies/",
        PageCommentViewSet.as_view({"post": "replies"}),
        name="project-page-comment-replies",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:pk>/resolve/",
        PageCommentViewSet.as_view({"post": "resolve"}),
        name="project-page-comment-resolve",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:pk>/reopen/",
        PageCommentViewSet.as_view({"post": "reopen"}),
        name="project-page-comment-reopen",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:comment_id>/reactions/",
        PageCommentReactionViewSet.as_view({"get": "list", "post": "create"}),
        name="project-page-comment-reactions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/"
        "<uuid:comment_id>/reactions/<str:reaction_code>/",
        PageCommentReactionViewSet.as_view({"delete": "destroy"}),
        name="project-page-comment-reactions",
    ),
    ## End Page Comments
    ## Page Subscriptions (category 10, feature 5 - "Abonnements/
    ## notifications par page")
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/subscribe/",
        PageSubscriptionViewSet.as_view({"get": "retrieve", "post": "create", "delete": "destroy"}),
        name="project-page-subscribe",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/subscribers/",
        PageSubscriptionViewSet.as_view({"get": "subscribers"}),
        name="project-page-subscribers",
    ),
    ## End Page Subscriptions
    ## Workspace-scoped Pages (category 10, feature 4 - "Wiki workspace en GA")
    path(
        "workspaces/<str:slug>/pages/",
        WorkspacePageViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-pages",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/",
        WorkspacePageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-pages",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/archive/",
        WorkspacePageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="workspace-page-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/lock/",
        WorkspacePageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="workspace-pages-lock-unlock",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/access/",
        WorkspacePageViewSet.as_view({"post": "access"}),
        name="workspace-pages-access",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/convert/",
        WorkspacePageViewSet.as_view({"post": "convert"}),
        name="workspace-pages-convert",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/reorder/",
        WorkspacePageViewSet.as_view({"post": "reorder"}),
        name="workspace-pages-reorder",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/description/",
        WorkspacePagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="workspace-page-description",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/versions/",
        WorkspacePageVersionEndpoint.as_view(),
        name="workspace-page-versions",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        WorkspacePageVersionEndpoint.as_view(),
        name="workspace-page-versions",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/reactions/",
        WorkspacePageReactionViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-page-reactions",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/reactions/<str:reaction_code>/",
        WorkspacePageReactionViewSet.as_view({"delete": "destroy"}),
        name="workspace-page-reactions",
    ),
    ## Workspace-scoped Page Comments (category 10, features 1+3 (merged))
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/",
        WorkspacePageCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-page-comments",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:pk>/",
        WorkspacePageCommentViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-page-comments",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:pk>/replies/",
        WorkspacePageCommentViewSet.as_view({"post": "replies"}),
        name="workspace-page-comment-replies",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:pk>/resolve/",
        WorkspacePageCommentViewSet.as_view({"post": "resolve"}),
        name="workspace-page-comment-resolve",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:pk>/reopen/",
        WorkspacePageCommentViewSet.as_view({"post": "reopen"}),
        name="workspace-page-comment-reopen",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:comment_id>/reactions/",
        WorkspacePageCommentReactionViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-page-comment-reactions",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:comment_id>/reactions/<str:reaction_code>/",
        WorkspacePageCommentReactionViewSet.as_view({"delete": "destroy"}),
        name="workspace-page-comment-reactions",
    ),
    ## End Workspace-scoped Page Comments
    ## Workspace-scoped Page Subscriptions (category 10, feature 5)
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/subscribe/",
        WorkspacePageSubscriptionViewSet.as_view({"get": "retrieve", "post": "create", "delete": "destroy"}),
        name="workspace-page-subscribe",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/subscribers/",
        WorkspacePageSubscriptionViewSet.as_view({"get": "subscribers"}),
        name="workspace-page-subscribers",
    ),
    ## End Workspace-scoped Page Subscriptions
    ## Workspace Page Collections (Wiki folders)
    path(
        "workspaces/<str:slug>/page-collections/",
        WorkspacePageCollectionViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-page-collections",
    ),
    path(
        "workspaces/<str:slug>/page-collections/<uuid:pk>/",
        WorkspacePageCollectionViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="workspace-page-collections",
    ),
    path(
        "workspaces/<str:slug>/page-collections/<uuid:pk>/reorder/",
        WorkspacePageCollectionViewSet.as_view({"post": "reorder"}),
        name="workspace-page-collections-reorder",
    ),
]
