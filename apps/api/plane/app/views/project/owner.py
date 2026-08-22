# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 5 - "Rôle Owner dédié + Team/Project Owner
délégué", exigences 8-11. Project Owner assign/revoke.
"""

# Django imports
from django.db import transaction

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, is_workspace_owner
from plane.app.serializers import ProjectMemberRoleSerializer
from plane.app.views.base import BaseAPIView
from plane.bgtasks.webhook_task import webhook_activity
from plane.db.models import AuditEventType, ProjectMember, WorkspaceMember
from plane.utils.audit_log import log_audit_event
from plane.utils.host import base_host
from plane.utils.project_owner import (
    emit_project_owner_revoked_events,
    guard_against_ineligible_owner_grant,
)


def _caller_is_owner_or_workspace_admin(request, slug) -> bool:
    """Exigence 8 - "peut être attribué par un Owner OU un Admin de
    workspace" - built on `is_workspace_owner`, per decision #4, rather
    than an ad hoc inline ownership check."""
    if is_workspace_owner(request.user, slug):
        return True
    return WorkspaceMember.objects.filter(
        workspace__slug=slug, member=request.user, role=ROLE.ADMIN.value, is_active=True
    ).exists()


class ProjectOwnerEndpoint(BaseAPIView):
    """
    POST   /api/workspaces/<slug>/projects/<project_id>/owner/  - body `{"member_id": "<uuid>"}`
    DELETE /api/workspaces/<slug>/projects/<project_id>/owner/

    Restricted to workspace Owner OR workspace Admin (exigence 8). The
    target must already have project role=Admin (20) - exigence 8's own
    wording, enforced via `guard_against_ineligible_owner_grant` (which
    also, per exigence 13, doubles as the Guest guard - a Guest can never
    be role=20 at the project level, but the helper's error message is
    explicit either way rather than relying on that coincidence).
    """

    def post(self, request, slug, project_id):
        if not _caller_is_owner_or_workspace_admin(request, slug):
            return Response(
                {"error": "Only the workspace owner or an admin can perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        member_id = request.data.get("member_id")
        if not member_id:
            return Response({"error": "member_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        target_member = (
            ProjectMember.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                member_id=member_id,
                is_active=True,
            )
            .select_related("member", "workspace", "project")
            .first()
        )
        if target_member is None:
            return Response(
                {"error": "This member is not an active member of this project."},
                status=status.HTTP_404_NOT_FOUND,
            )

        grant_error = guard_against_ineligible_owner_grant(target_member.role)
        if grant_error:
            return Response({"error": grant_error}, status=status.HTTP_400_BAD_REQUEST)

        if target_member.is_owner:
            return Response(
                {"error": "This member is already the Project Owner."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_owner = None
        with transaction.atomic():
            # Exigence 11 - a project has at most one active Project Owner
            # at a time - replacing an existing one is a two-step
            # transfer, not an error, matching the `unique_project_owner`
            # partial unique constraint.
            previous_owner = (
                ProjectMember.objects.filter(project_id=project_id, workspace__slug=slug, is_owner=True)
                .exclude(pk=target_member.pk)
                .select_related("workspace")
                .first()
            )
            if previous_owner is not None:
                previous_owner.is_owner = False
                previous_owner.save(update_fields=["is_owner", "updated_at"])

            target_member.is_owner = True
            target_member.save(update_fields=["is_owner", "updated_at"])

        if previous_owner is not None:
            emit_project_owner_revoked_events(
                [previous_owner],
                actor=request.user,
                request=request,
                reason="replaced_by_new_owner",
            )

        log_audit_event(
            AuditEventType.PROJECT_OWNER_ASSIGNED,
            request=request,
            workspace=target_member.workspace,
            actor=request.user,
            target_user=target_member.member,
            target_type="Project",
            target_id=str(project_id),
            old_value=({"previous_owner_member_id": str(previous_owner.member_id)} if previous_owner else None),
            new_value={"owner_member_id": str(member_id)},
            metadata={"project_id": str(project_id)},
        )
        webhook_activity.delay(
            event="project_owner",
            verb="assigned",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=request.user.id,
            slug=slug,
            current_site=base_host(request=request, is_app=True),
            event_id=str(project_id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={"project_id": str(project_id), "member_id": str(member_id)},
        )

        serializer = ProjectMemberRoleSerializer(target_member)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id):
        if not _caller_is_owner_or_workspace_admin(request, slug):
            return Response(
                {"error": "Only the workspace owner or an admin can perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        target_member = (
            ProjectMember.objects.filter(project_id=project_id, workspace__slug=slug, is_owner=True)
            .select_related("member", "workspace")
            .first()
        )
        if target_member is None:
            return Response(
                {"error": "This project has no active Project Owner."},
                status=status.HTTP_404_NOT_FOUND,
            )

        target_member.is_owner = False
        target_member.save(update_fields=["is_owner", "updated_at"])

        emit_project_owner_revoked_events(
            [target_member],
            actor=request.user,
            request=request,
            reason="revoked_by_owner_or_admin",
        )

        return Response(status=status.HTTP_204_NO_CONTENT)
