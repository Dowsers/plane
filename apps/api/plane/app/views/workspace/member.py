# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Count, Q, OuterRef, Subquery, IntegerField
from django.utils import timezone
from django.db.models.functions import Coalesce

# Third party modules
from rest_framework import status
from rest_framework.response import Response

from django.core.exceptions import ValidationError as DjangoValidationError

from plane.app.permissions import WorkspaceEntityPermission, allow_permission, ROLE

# Module imports
from plane.app.serializers import (
    ProjectMemberRoleSerializer,
    WorkspaceMemberAdminSerializer,
    WorkspaceMemberMeSerializer,
    WorkSpaceMemberSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.bgtasks.webhook_task import webhook_activity
from plane.db.models import AuditEventType, Project, ProjectMember, WorkspaceMember, WorkspaceRole, DraftIssue
from plane.utils.audit_log import log_audit_event
from plane.utils.cache import invalidate_cache
from plane.utils.host import base_host
from plane.utils.project_owner import emit_project_owner_revoked_events
from plane.utils.rbac import sync_member_role_fields
from plane.utils.view_subscriptions import deactivate_user_view_subscriptions
from plane.utils.agent_actor import agent_role_error, is_workspace_agent, member_visibility_q

from .. import BaseViewSet


class WorkSpaceMemberViewSet(BaseViewSet):
    serializer_class = WorkspaceMemberAdminSerializer
    model = WorkspaceMember

    search_fields = ["member__display_name", "member__first_name"]
    use_read_replica = True

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("member", "member__avatar_asset", "workspace")
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(member=request.user, workspace__slug=slug, is_active=True)

        # Get all active workspace members
        workspace_members = self.get_queryset()
        if workspace_member.role > 5:
            serializer = WorkspaceMemberAdminSerializer(workspace_members, fields=("id", "member", "role"), many=True)
        else:
            serializer = WorkSpaceMemberSerializer(workspace_members, fields=("id", "member", "role"), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        workspace_member = WorkspaceMember.objects.get(member=request.user, workspace__slug=slug, is_active=True)

        try:
            # Get the specific workspace member by pk
            member = self.get_queryset().get(pk=pk)
        except WorkspaceMember.DoesNotExist:
            return Response(
                {"error": "Workspace member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if workspace_member.role > ROLE.GUEST.value:
            serializer = WorkspaceMemberAdminSerializer(member, fields=("id", "member", "role"))
        else:
            serializer = WorkSpaceMemberSerializer(member, fields=("id", "member", "role"))
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        workspace_member = WorkspaceMember.objects.get(
            member_visibility_q("member__"), pk=pk, workspace__slug=slug, is_active=True
        )
        if request.user.id == workspace_member.member_id:
            return Response(
                {"error": "You cannot update your own role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Category 11 (docs/feature-specs/11-admin-security-sso.md in
        # plane-selfhost), feature 4 - "Constructeur de roles
        # personnalises". This endpoint now also accepts `custom_role_id`
        # alongside the legacy `role` field (Considerations API/UX). Both
        # are resolved to a single EFFECTIVE new legacy role value BEFORE
        # any of the pre-existing agent/guest-demotion checks below run,
        # so those checks see the real outcome regardless of which field
        # the caller used.
        role_in_payload = "role" in request.data
        custom_role_id_in_payload = "custom_role_id" in request.data
        custom_role_id_value = request.data.get("custom_role_id")
        # `{"custom_role_id": null}` explicitly - clear the custom role,
        # falling back to whichever system role matches the member's
        # (possibly also-changing) legacy value, rather than a no-op.
        clear_custom_role = custom_role_id_in_payload and custom_role_id_value is None

        custom_role_obj = None
        if custom_role_id_in_payload and custom_role_id_value is not None:
            try:
                custom_role_obj = WorkspaceRole.objects.get(pk=custom_role_id_value, workspace__slug=slug)
            except (WorkspaceRole.DoesNotExist, ValueError, TypeError):
                return Response(
                    {"error": "custom_role_id does not refer to a role in this workspace."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if role_in_payload:
            try:
                effective_new_role = int(request.data.get("role"))
            except (TypeError, ValueError):
                return Response({"error": "role must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        elif custom_role_id_in_payload:
            effective_new_role = (
                custom_role_obj.legacy_role_value if custom_role_obj is not None else workspace_member.role
            )
        else:
            effective_new_role = workspace_member.role

        # `role` and `custom_role_id` must agree when both are given
        # (Considerations API/UX - "l'API rejette une combinaison
        # incoherente"), checked explicitly here too (not just inside
        # `sync_member_role_fields` below) so the error is caught before
        # ANY of the guest-demotion side effects run.
        if (
            role_in_payload
            and custom_role_id_in_payload
            and custom_role_obj is not None
            and custom_role_obj.legacy_role_value != effective_new_role
        ):
            return Response(
                {"error": "`role` and `custom_role_id` are inconsistent for this member."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Exigence 8 (docs/feature-specs/09-ai-features.md "7. Type
        # d'acteur agent de premiere classe" in plane-selfhost) - an agent
        # can never be promoted to Admin.
        if effective_new_role == ROLE.ADMIN.value and is_workspace_agent(workspace_member.member):
            return Response(agent_role_error(), status=status.HTTP_400_BAD_REQUEST)

        old_role = workspace_member.role
        old_custom_role_id = workspace_member.custom_role_id

        # If a user is moved to a guest role he can't have any other role in projects
        if (role_in_payload or custom_role_id_in_payload) and effective_new_role == 5:
            # Category 11 (docs/feature-specs/11-admin-security-sso.md in
            # plane-selfhost), feature 5, exigence 12/13 - this `.update()`
            # is a QuerySet-level bulk write, bypassing `ProjectMember.save()`
            # and any signal exactly like the `bulk_update()` calls flagged
            # in decision #3 - a demotion to workspace Guest always makes
            # every one of this member's `ProjectMember.is_owner=True` rows
            # ineligible (role is forced to 5 < 20 here), so `is_owner=False`
            # is included directly in the same `.update()` call rather than
            # a separate pass.
            revoked_owner_project_members = list(
                ProjectMember.objects.filter(
                    workspace__slug=slug,
                    member_id=workspace_member.member_id,
                    is_owner=True,
                ).select_related("workspace")
            )
            ProjectMember.objects.filter(workspace__slug=slug, member_id=workspace_member.member_id).update(
                role=5, is_owner=False
            )
            if revoked_owner_project_members:
                emit_project_owner_revoked_events(
                    revoked_owner_project_members,
                    actor=request.user,
                    request=request,
                    reason="workspace_role_demoted_to_guest",
                )

        # Explicit sync (decision #2 - no Django signal), the SINGLE-PATCH
        # half of decision #5's `role`<->`custom_role` coherence
        # requirement - sets both fields consistently in-memory before
        # `serializer.save()` below persists them (the serializer itself
        # has no `custom_role_id` field, only the model's plain
        # `custom_role`, so this is the only place that ever writes it).
        if role_in_payload or custom_role_id_in_payload:
            try:
                sync_member_role_fields(
                    workspace_member,
                    role=effective_new_role if (role_in_payload or clear_custom_role) else None,
                    custom_role=custom_role_obj if (custom_role_id_in_payload and not clear_custom_role) else None,
                )
            except DjangoValidationError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = WorkSpaceMemberSerializer(workspace_member, data=request.data, partial=True)

        if serializer.is_valid():
            serializer.save()
            new_role = serializer.instance.role
            new_custom_role_id = serializer.instance.custom_role_id
            if new_role != old_role or new_custom_role_id != old_custom_role_id:
                log_audit_event(
                    AuditEventType.MEMBER_ROLE_CHANGED,
                    request=request,
                    workspace=workspace_member.workspace,
                    actor=request.user,
                    target_user=workspace_member.member,
                    old_value={
                        "role": old_role,
                        "custom_role_id": str(old_custom_role_id) if old_custom_role_id else None,
                    },
                    new_value={
                        "role": new_role,
                        "custom_role_id": str(new_custom_role_id) if new_custom_role_id else None,
                    },
                )
                # Spec's own `workspace_member.role_changed` webhook event
                # (Considerations API/UX) - reuses the shared
                # `Webhook.workspace_security` boolean column (decision #3),
                # not a new column.
                webhook_activity.delay(
                    event="workspace_member",
                    verb="role_changed",
                    field=None,
                    old_value=None,
                    new_value=None,
                    actor_id=request.user.id,
                    slug=slug,
                    current_site=base_host(request=request, is_app=True),
                    event_id=str(workspace_member.id),
                    old_identifier=None,
                    new_identifier=None,
                    event_data_override={
                        "member_id": str(workspace_member.id),
                        "old_role_id": str(old_custom_role_id) if old_custom_role_id else None,
                        "new_role_id": str(new_custom_role_id) if new_custom_role_id else None,
                        "changed_by": str(request.user.id),
                    },
                )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        # Check the user role who is deleting the user
        workspace_member = WorkspaceMember.objects.get(
            member_visibility_q("member__"), workspace__slug=slug, pk=pk, is_active=True
        )

        # check requesting user role
        requesting_workspace_member = WorkspaceMember.objects.get(
            workspace__slug=slug, member=request.user, is_active=True
        )

        if str(workspace_member.id) == str(requesting_workspace_member.id):
            return Response(
                {"error": "You cannot remove yourself from the workspace. Please use leave workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if requesting_workspace_member.role < workspace_member.role:
            return Response(
                {"error": "You cannot remove a user having role higher than you"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            Project.objects.annotate(
                total_members=Count("project_projectmember"),
                member_with_role=Count(
                    "project_projectmember",
                    filter=Q(
                        project_projectmember__member_id=workspace_member.id,
                        project_projectmember__role=20,
                    ),
                ),
            )
            .filter(total_members=1, member_with_role=1, workspace__slug=slug)
            .exists()
        ):
            return Response(
                {
                    "error": "User is a part of some projects where they are the only admin, they should either leave that project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Deactivate the users from the projects where the user is part of.
        # Category 11, feature 5, exigence 12/13 - same bulk-write
        # auto-revoke fix as `partial_update` above: deactivation makes
        # every `is_owner=True` row for this member ineligible.
        revoked_owner_project_members = list(
            ProjectMember.objects.filter(
                workspace__slug=slug,
                member_id=workspace_member.member_id,
                is_active=True,
                is_owner=True,
            ).select_related("workspace")
        )
        _ = ProjectMember.objects.filter(
            workspace__slug=slug, member_id=workspace_member.member_id, is_active=True
        ).update(is_active=False, is_owner=False, updated_at=timezone.now())
        if revoked_owner_project_members:
            emit_project_owner_revoked_events(
                revoked_owner_project_members,
                actor=request.user,
                request=request,
                reason="workspace_member_removed",
            )

        workspace_member.is_active = False
        workspace_member.save()
        log_audit_event(
            AuditEventType.MEMBER_REMOVED,
            request=request,
            workspace=workspace_member.workspace,
            actor=request.user,
            target_user=workspace_member.member,
            metadata={"role_at_removal": workspace_member.role},
        )
        deactivate_user_view_subscriptions(workspace_member.member_id, slug)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @invalidate_cache(
        path="/api/workspaces/:slug/members/",
        url_params=True,
        user=False,
        multiple=True,
    )
    @invalidate_cache(path="/api/users/me/settings/")
    @invalidate_cache(path="api/users/me/workspaces/", user=False, multiple=True)
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def leave(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(workspace__slug=slug, member=request.user, is_active=True)

        # Check if the leaving user is the only admin of the workspace
        if (
            workspace_member.role == 20
            and not WorkspaceMember.objects.filter(workspace__slug=slug, role=20, is_active=True).count() > 1
        ):
            return Response(
                {
                    "error": "You cannot leave the workspace as you are the only admin of the workspace you will have to either delete the workspace or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            Project.objects.annotate(
                total_members=Count("project_projectmember"),
                member_with_role=Count(
                    "project_projectmember",
                    filter=Q(
                        project_projectmember__member_id=request.user.id,
                        project_projectmember__role=20,
                    ),
                ),
            )
            .filter(total_members=1, member_with_role=1, workspace__slug=slug)
            .exists()
        ):
            return Response(
                {
                    "error": "You are a part of some projects where you are the only admin, you should either leave the project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # # Deactivate the users from the projects where the user is part of.
        # Same bulk-write auto-revoke fix as `destroy`/`partial_update`
        # above.
        revoked_owner_project_members = list(
            ProjectMember.objects.filter(
                workspace__slug=slug,
                member_id=workspace_member.member_id,
                is_active=True,
                is_owner=True,
            ).select_related("workspace")
        )
        _ = ProjectMember.objects.filter(
            workspace__slug=slug, member_id=workspace_member.member_id, is_active=True
        ).update(is_active=False, is_owner=False, updated_at=timezone.now())
        if revoked_owner_project_members:
            emit_project_owner_revoked_events(
                revoked_owner_project_members,
                actor=request.user,
                request=request,
                reason="workspace_member_left",
            )

        # # Deactivate the user
        workspace_member.is_active = False
        workspace_member.save()
        log_audit_event(
            AuditEventType.MEMBER_REMOVED,
            request=request,
            workspace=workspace_member.workspace,
            actor=request.user,
            target_user=workspace_member.member,
            metadata={"role_at_removal": workspace_member.role, "self_initiated": True},
        )
        deactivate_user_view_subscriptions(workspace_member.member_id, slug)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberUserViewsEndpoint(BaseAPIView):
    def post(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(workspace__slug=slug, member=request.user, is_active=True)
        workspace_member.view_props = request.data.get("view_props", {})
        workspace_member.save()

        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberUserEndpoint(BaseAPIView):
    use_read_replica = True

    def get(self, request, slug):
        draft_issue_count = (
            DraftIssue.objects.filter(created_by=request.user, workspace_id=OuterRef("workspace_id"))
            .values("workspace_id")
            .annotate(count=Count("id"))
            .values("count")
        )

        workspace_member = (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .annotate(draft_issue_count=Coalesce(Subquery(draft_issue_count, output_field=IntegerField()), 0))
            .first()
        )
        serializer = WorkspaceMemberMeSerializer(workspace_member)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceProjectMemberEndpoint(BaseAPIView):
    serializer_class = ProjectMemberRoleSerializer
    model = ProjectMember

    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug):
        # Fetch all project IDs where the user is involved
        project_ids = (
            ProjectMember.objects.filter(member=request.user, is_active=True)
            .values_list("project_id", flat=True)
            .distinct()
        )

        # Get all the project members in which the user is involved
        project_members = ProjectMember.objects.filter(
            workspace__slug=slug, project_id__in=project_ids, is_active=True
        ).select_related("project", "member", "workspace")
        project_members = ProjectMemberRoleSerializer(project_members, many=True).data

        project_members_dict = dict()

        # Construct a dictionary with project_id as key and project_members as value
        for project_member in project_members:
            project_id = project_member.pop("project")
            if str(project_id) not in project_members_dict:
                project_members_dict[str(project_id)] = []
            project_members_dict[str(project_id)].append(project_member)

        return Response(project_members_dict, status=status.HTTP_200_OK)
