# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Count

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    ProjectTemplateWriteSerializer,
    ProjectTemplateListSerializer,
    ProjectTemplateSerializer,
)
from plane.db.models import (
    Project,
    ProjectTemplate,
    ProjectTemplateState,
    ProjectTemplateLabel,
    ProjectTemplateMember,
    ProjectTemplateIssue,
    Workspace,
)
from plane.utils.project_template import build_template_from_project, instantiate_project_from_template
from ..base import BaseAPIView, BaseViewSet


def _replace_states(template, states_data, actor):
    ProjectTemplateState.objects.filter(template=template).delete()
    ProjectTemplateState.objects.bulk_create(
        [
            ProjectTemplateState(
                template=template,
                name=state["name"],
                color=state["color"],
                group=state.get("group", "backlog"),
                sequence=state.get("sequence", (index + 1) * 10000),
                default=state.get("default", False),
                created_by=actor,
            )
            for index, state in enumerate(states_data)
        ]
    )


def _replace_labels(template, labels_data, actor):
    ProjectTemplateLabel.objects.filter(template=template).delete()
    # Two-pass so parent rows exist before their children reference them -
    # payload uses a client-side temp key ("key") to express parent/child
    # relationships since real ids don't exist until created.
    key_to_label = {}
    parents = [label for label in labels_data if not label.get("parent_key")]
    children = [label for label in labels_data if label.get("parent_key")]
    for label in parents:
        key_to_label[label.get("key")] = ProjectTemplateLabel.objects.create(
            template=template,
            name=label["name"],
            color=label.get("color", ""),
            sort_order=label.get("sort_order", 65535),
            created_by=actor,
        )
    for label in children:
        key_to_label[label.get("key")] = ProjectTemplateLabel.objects.create(
            template=template,
            name=label["name"],
            color=label.get("color", ""),
            parent=key_to_label.get(label.get("parent_key")),
            sort_order=label.get("sort_order", 65535),
            created_by=actor,
        )


def _replace_members(template, members_data, actor):
    ProjectTemplateMember.objects.filter(template=template).delete()
    ProjectTemplateMember.objects.bulk_create(
        [
            ProjectTemplateMember(
                template=template,
                member_id=member["member_id"],
                role=member.get("role", 15),
                created_by=actor,
            )
            for member in members_data
        ]
    )


class ProjectTemplateViewSet(BaseViewSet):
    model = ProjectTemplate

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .annotate(total_states=Count("states", distinct=True))
            .annotate(total_labels=Count("labels", distinct=True))
            .annotate(total_issues=Count("issues", distinct=True))
            .order_by("-created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        templates = self.get_queryset()
        return Response(ProjectTemplateListSerializer(templates, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        template = ProjectTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is None:
            return Response({"error": "Project template not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProjectTemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        source_project_id = request.data.get("source_project_id")
        if source_project_id:
            project = Project.objects.filter(workspace__slug=slug, pk=source_project_id).first()
            if project is None:
                return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
            name = request.data.get("name", f"{project.name} Template")
            if ProjectTemplate.objects.filter(workspace=workspace, name__iexact=name).exists():
                return Response(
                    {"name": "A project template with this name already exists"}, status=status.HTTP_400_BAD_REQUEST
                )
            template = build_template_from_project(
                project,
                name=name,
                description=request.data.get("description", ""),
                include_current_work_items=bool(request.data.get("include_current_work_items", False)),
                actor=request.user,
            )
            template = self.get_queryset().filter(pk=template.pk).first()
            return Response(ProjectTemplateSerializer(template).data, status=status.HTTP_201_CREATED)

        serializer = ProjectTemplateWriteSerializer(data=request.data, context={"workspace_id": workspace.id})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            template = serializer.save(workspace=workspace, created_by=request.user, updated_by=request.user)
            _replace_states(template, request.data.get("states", []), request.user)
            _replace_labels(template, request.data.get("labels", []), request.user)
            _replace_members(template, request.data.get("members", []), request.user)

        template = self.get_queryset().filter(pk=template.pk).first()
        return Response(ProjectTemplateSerializer(template).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        template = ProjectTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is None:
            return Response({"error": "Project template not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProjectTemplateWriteSerializer(
            template, data=request.data, partial=True, context={"workspace_id": template.workspace_id}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            serializer.save(updated_by=request.user)
            if "states" in request.data:
                _replace_states(template, request.data.get("states", []), request.user)
            if "labels" in request.data:
                _replace_labels(template, request.data.get("labels", []), request.user)
            if "members" in request.data:
                _replace_members(template, request.data.get("members", []), request.user)

        template = self.get_queryset().filter(pk=template.pk).first()
        return Response(ProjectTemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        template = ProjectTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is not None:
            template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectTemplateDuplicateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        template = ProjectTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is None:
            return Response({"error": "Project template not found"}, status=status.HTTP_404_NOT_FOUND)

        base_name = f"{template.name} (Copy)"
        name = base_name
        suffix = 1
        while ProjectTemplate.objects.filter(workspace_id=template.workspace_id, name__iexact=name).exists():
            suffix += 1
            name = f"{base_name} {suffix}"

        with transaction.atomic():
            new_template = ProjectTemplate.objects.create(
                workspace_id=template.workspace_id,
                name=name,
                description=template.description,
                logo_props=template.logo_props,
                network=template.network,
                linked_initiative_id=template.linked_initiative_id,
                add_creator_as_lead=template.add_creator_as_lead,
                created_by=request.user,
                updated_by=request.user,
            )

            state_id_map = {}
            for state in template.states.all():
                new_state = ProjectTemplateState.objects.create(
                    template=new_template,
                    name=state.name,
                    color=state.color,
                    group=state.group,
                    sequence=state.sequence,
                    default=state.default,
                    created_by=request.user,
                )
                state_id_map[state.id] = new_state

            label_id_map = {}
            labels = list(template.labels.all())
            for label in sorted(labels, key=lambda item: 0 if item.parent_id is None else 1):
                new_label = ProjectTemplateLabel.objects.create(
                    template=new_template,
                    parent=label_id_map.get(label.parent_id),
                    name=label.name,
                    color=label.color,
                    sort_order=label.sort_order,
                    created_by=request.user,
                )
                label_id_map[label.id] = new_label

            member_id_map = {}
            for member in template.members.all():
                new_member = ProjectTemplateMember.objects.create(
                    template=new_template, member_id=member.member_id, role=member.role, created_by=request.user
                )
                member_id_map[member.id] = new_member

            issue_id_map = {}
            template_issues = list(template.issues.prefetch_related("labels", "assignees").order_by("sort_order"))
            remaining = template_issues
            while remaining:
                progressed = [
                    issue
                    for issue in remaining
                    if issue.parent_id is None or issue.parent_id in issue_id_map
                ]
                if not progressed:
                    break
                for issue in progressed:
                    new_issue = ProjectTemplateIssue.objects.create(
                        template=new_template,
                        name=issue.name,
                        description_html=issue.description_html,
                        priority=issue.priority,
                        state=state_id_map.get(issue.state_id),
                        parent=issue_id_map.get(issue.parent_id),
                        sort_order=issue.sort_order,
                        target_date_offset_days=issue.target_date_offset_days,
                        created_by=request.user,
                    )
                    new_issue.labels.set(
                        [label_id_map[label.id] for label in issue.labels.all() if label.id in label_id_map]
                    )
                    new_issue.assignees.set(
                        [member_id_map[member.id] for member in issue.assignees.all() if member.id in member_id_map]
                    )
                    issue_id_map[issue.id] = new_issue
                remaining = [issue for issue in remaining if issue.id not in issue_id_map]

        new_template = ProjectTemplate.objects.filter(pk=new_template.pk).first()
        return Response(ProjectTemplateSerializer(new_template).data, status=status.HTTP_201_CREATED)


class ProjectTemplateCreateProjectEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        template = ProjectTemplate.objects.filter(workspace__slug=slug, pk=pk).first()
        if template is None:
            return Response({"error": "Project template not found"}, status=status.HTTP_404_NOT_FOUND)

        name = request.data.get("name")
        identifier = request.data.get("identifier")
        if not name or not identifier:
            return Response({"error": "name and identifier are required"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)

        project = instantiate_project_from_template(
            template,
            workspace=workspace,
            creator=request.user,
            name=name,
            identifier=identifier,
            network=request.data.get("network"),
            description=request.data.get("description"),
            logo_props=request.data.get("logo_props"),
            linked_initiative_id=request.data.get("linked_initiative") or template.linked_initiative_id,
        )

        from plane.app.serializers import ProjectListSerializer

        return Response(ProjectListSerializer(project).data, status=status.HTTP_201_CREATED)
