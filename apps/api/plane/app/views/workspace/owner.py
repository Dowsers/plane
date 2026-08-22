# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 5 - "Rôle Owner dédié + Team/Project Owner
délégué", exigences 3/4/17. Workspace ownership transfer - the ONLY
write path (besides workspace creation, already correct) that can change
`Workspace.owner`.
"""

# Django imports
from django.db import transaction

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, IsWorkspaceOwner
from plane.app.views.base import BaseAPIView
from plane.bgtasks.webhook_task import webhook_activity
from plane.db.models import AuditEventType, Workspace, WorkspaceMember
from plane.utils.audit_log import log_audit_event
from plane.utils.host import base_host


class WorkspaceOwnerTransferEndpoint(BaseAPIView):
    """
    POST /api/workspaces/<slug>/owner/transfer/

    Body: `{"new_owner_id": "<uuid>"}`. Restricted to the CURRENT owner
    only (exigence 4 - "aucun Admin ne peut se l'auto-attribuer ni forcer
    un transfert"). Does NOT demote the old owner (exigence 3 - they stay
    Admin).
    """

    permission_classes = [IsWorkspaceOwner]

    def post(self, request, slug):
        workspace = Workspace.objects.select_related("owner").get(slug=slug)

        new_owner_id = request.data.get("new_owner_id")
        if not new_owner_id:
            return Response({"error": "new_owner_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        if str(new_owner_id) == str(workspace.owner_id):
            return Response(
                {"error": "This member is already the workspace owner."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Application-level validation (not a DB constraint, per the
        # spec's own "Implications sur le modele de donnees" wording) that
        # `Workspace.owner` always references an active WorkspaceMember
        # with role >= 20 - this is the one real write path for that
        # invariant besides workspace creation (already correct).
        new_owner_membership = (
            WorkspaceMember.objects.filter(
                workspace=workspace,
                member_id=new_owner_id,
                role=ROLE.ADMIN.value,
                is_active=True,
            )
            .select_related("member")
            .first()
        )
        if new_owner_membership is None:
            return Response(
                {"error": "The target member must be an active Admin of this workspace to receive ownership."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_owner_id = workspace.owner_id

        with transaction.atomic():
            workspace.owner_id = new_owner_id
            workspace.save(update_fields=["owner", "updated_at"])

        log_audit_event(
            AuditEventType.OWNERSHIP_TRANSFERRED,
            request=request,
            workspace=workspace,
            actor=request.user,
            target_user=new_owner_membership.member,
            old_value={"owner_id": str(old_owner_id)},
            new_value={"owner_id": str(new_owner_id)},
            metadata={"workspace_id": str(workspace.id)},
        )
        webhook_activity.delay(
            event="workspace_ownership",
            verb="transferred",
            field=None,
            old_value=str(old_owner_id),
            new_value=str(new_owner_id),
            actor_id=request.user.id,
            slug=slug,
            current_site=base_host(request=request, is_app=True),
            event_id=str(workspace.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={
                "workspace_id": str(workspace.id),
                "previous_owner_id": str(old_owner_id),
                "new_owner_id": str(new_owner_id),
            },
        )

        return Response(
            {"workspace": str(workspace.id), "owner_id": str(new_owner_id)},
            status=status.HTTP_200_OK,
        )
