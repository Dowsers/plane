# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 14, feature 14c (docs/feature-specs/14-pricing-gap-remediation.md
in plane-selfhost, "Page Templates") - CRUD + duplicate for `PageTemplate`
(section 1), "save a Page as a template" (section 2), and "create a Page
from a template" (section 3). Calqued directly on
`plane.app.views.project_template.base` (`ProjectTemplateViewSet`/
`ProjectTemplateDuplicateEndpoint`/`ProjectTemplateCreateProjectEndpoint`).

Open question 1 (section 1 of the spec) is resolved as: template creation/
edition/deletion, and "save as template", are Admin-only (the spec's own
stated recommendation, "le brief recommande Admin-only par analogie avec
ProjectTemplate") - read access stays open to any workspace MEMBER.
"""

# Django imports
from django.db import transaction

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    PageTemplateWriteSerializer,
    PageTemplateListSerializer,
    PageTemplateSerializer,
    PageDetailSerializer,
    WorkspacePageDetailSerializer,
)
from plane.db.models import Page, PageTemplate, PageSubscriber, Project, ProjectPage, Teamspace, Workspace
from plane.utils.page_template import build_page_template_from_page, instantiate_page_from_template
from ..base import BaseAPIView, BaseViewSet


class PageTemplateViewSet(BaseViewSet):
    model = PageTemplate

    def get_queryset(self):
        return super().get_queryset().filter(workspace__slug=self.kwargs.get("slug")).order_by("-created_at")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        templates = self.get_queryset()
        return Response(PageTemplateListSerializer(templates, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        template = self.get_queryset().filter(pk=pk).first()
        if template is None:
            return Response({"error": "Page template not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(PageTemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        serializer = PageTemplateWriteSerializer(data=request.data, context={"workspace_id": workspace.id})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        template = serializer.save(workspace=workspace, created_by=request.user, updated_by=request.user)
        template = self.get_queryset().filter(pk=template.pk).first()
        return Response(PageTemplateSerializer(template).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        template = self.get_queryset().filter(pk=pk).first()
        if template is None:
            return Response({"error": "Page template not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = PageTemplateWriteSerializer(
            template, data=request.data, partial=True, context={"workspace_id": template.workspace_id}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save(updated_by=request.user)
        template = self.get_queryset().filter(pk=template.pk).first()
        return Response(PageTemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        template = self.get_queryset().filter(pk=pk).first()
        if template is not None:
            template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageTemplateDuplicateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        template = PageTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is None:
            return Response({"error": "Page template not found"}, status=status.HTTP_404_NOT_FOUND)

        base_name = f"{template.name} (Copy)"
        name = base_name
        suffix = 1
        while PageTemplate.objects.filter(workspace_id=template.workspace_id, name__iexact=name).exists():
            suffix += 1
            name = f"{base_name} {suffix}"

        new_template = PageTemplate.objects.create(
            workspace_id=template.workspace_id,
            name=name,
            description_html=template.description_html,
            description_json=template.description_json,
            logo_props=template.logo_props,
            created_by=request.user,
            updated_by=request.user,
        )

        return Response(PageTemplateSerializer(new_template).data, status=status.HTTP_201_CREATED)


class PageSaveAsTemplateEndpoint(BaseAPIView):
    """Section 2 - `POST workspaces/<slug>/pages/<page_id>/save-as-template/`.

    Workspace-scoped route (not nested under a project) since `PageTemplate`
    is always workspace-scoped and a Page's own scope (project, teamspace,
    or global) has no bearing on this endpoint (exigence 6).
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, page_id):
        page = Page.objects.filter(workspace__slug=slug, pk=page_id).first()
        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        name = request.data.get("name") or f"{page.name} Template"
        if PageTemplate.objects.filter(workspace_id=page.workspace_id, name__iexact=name).exists():
            return Response(
                {"name": "A page template with this name already exists"}, status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            template = build_page_template_from_page(page, name=name, actor=request.user)

            from plane.db.models import PageActivity

            PageActivity.objects.create(
                workspace_id=page.workspace_id,
                page=page,
                actor=request.user,
                verb="saved_as_template",
                field="template",
                new_value=template.name,
            )

        return Response(PageTemplateSerializer(template).data, status=status.HTTP_201_CREATED)


class PageTemplateCreatePageEndpoint(BaseAPIView):
    """Section 3 - `POST workspaces/<slug>/page-templates/<template_id>/create-page/`.

    Instantiates a brand new Page from a PageTemplate, scoped per the
    request body: `project_id` (project-scoped Page, mirrors
    `PageViewSet.create`), `teamspace_id` (teamspace-scoped Page), or
    `is_global=true` (workspace Wiki Page, mirrors
    `WorkspacePageViewSet.create`). Exactly one of the three must be
    provided. Permission follows the destination scope's own existing Page
    creation permission (spec: "aucune permission additionnelle liee au
    PageTemplate lui-meme"), enforced below per-branch rather than via the
    decorator (which cannot express a scope-conditional role level).
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        template = PageTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is None:
            return Response({"error": "Page template not found"}, status=status.HTTP_404_NOT_FOUND)

        workspace = Workspace.objects.get(slug=slug)
        name = request.data.get("name") or template.name

        project_id = request.data.get("project_id")
        teamspace_id = request.data.get("teamspace_id")
        is_global = bool(request.data.get("is_global", False))

        if sum(bool(value) for value in (project_id, teamspace_id, is_global)) != 1:
            return Response(
                {"error": "Exactly one of project_id, teamspace_id or is_global is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if project_id:
            project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
            if project is None:
                return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

            def create_page(name, description_html, description_json, logo_props):
                page = Page.objects.create(
                    name=name,
                    description_html=description_html,
                    description_json=description_json,
                    logo_props=logo_props,
                    owned_by=request.user,
                    workspace_id=project.workspace_id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                ProjectPage.objects.create(
                    workspace_id=page.workspace_id,
                    project_id=project.id,
                    page_id=page.id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                PageSubscriber.objects.get_or_create(
                    page=page,
                    subscriber_id=request.user.id,
                    defaults={
                        "workspace_id": page.workspace_id,
                        "subscribed_manually": True,
                        "created_by_id": page.created_by_id,
                        "updated_by_id": page.updated_by_id,
                    },
                )
                return page

            page = instantiate_page_from_template(template, name=name, create_page=create_page, actor=request.user)
            page = Page.objects.filter(pk=page.pk).first()
            return Response(PageDetailSerializer(page).data, status=status.HTTP_201_CREATED)

        if teamspace_id:
            teamspace = Teamspace.objects.filter(workspace__slug=slug, pk=teamspace_id).first()
            if teamspace is None:
                return Response({"error": "Teamspace not found"}, status=status.HTTP_404_NOT_FOUND)

            def create_page(name, description_html, description_json, logo_props):
                page = Page.objects.create(
                    name=name,
                    description_html=description_html,
                    description_json=description_json,
                    logo_props=logo_props,
                    owned_by=request.user,
                    workspace_id=workspace.id,
                    teamspace_id=teamspace.id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                PageSubscriber.objects.get_or_create(
                    page=page,
                    subscriber_id=request.user.id,
                    defaults={
                        "workspace_id": page.workspace_id,
                        "subscribed_manually": True,
                        "created_by_id": page.created_by_id,
                        "updated_by_id": page.updated_by_id,
                    },
                )
                return page

            page = instantiate_page_from_template(template, name=name, create_page=create_page, actor=request.user)
            page = Page.objects.filter(pk=page.pk).first()
            return Response(PageDetailSerializer(page).data, status=status.HTTP_201_CREATED)

        # is_global - workspace Wiki page
        def create_page(name, description_html, description_json, logo_props):
            page = Page.objects.create(
                name=name,
                description_html=description_html,
                description_json=description_json,
                logo_props=logo_props,
                owned_by=request.user,
                workspace_id=workspace.id,
                is_global=True,
                collection_id=request.data.get("collection_id"),
                created_by=request.user,
                updated_by=request.user,
            )
            PageSubscriber.objects.get_or_create(
                page=page,
                subscriber_id=request.user.id,
                defaults={
                    "workspace_id": page.workspace_id,
                    "subscribed_manually": True,
                    "created_by_id": page.created_by_id,
                    "updated_by_id": page.updated_by_id,
                },
            )
            return page

        page = instantiate_page_from_template(template, name=name, create_page=create_page, actor=request.user)
        page = Page.objects.filter(pk=page.pk).first()
        return Response(WorkspacePageDetailSerializer(page).data, status=status.HTTP_201_CREATED)
