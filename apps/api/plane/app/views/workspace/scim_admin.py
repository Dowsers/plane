# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif" - the ADMIN-facing "manage my
SCIM setup" surface (workspace-scoped, session-authenticated, this fork's
NORMAL `plane.app` conventions - `BaseAPIView`, `@allow_permission`,
`log_audit_event`). This is deliberately NOT under `/api/scim/v2/` and
shares nothing with `plane.scim`'s protocol views beyond the `SCIMToken`
model itself and the `is_scim_enabled()` flag check (imported from
`plane.scim.authentication` - a single source of truth for that check,
reused by both surfaces rather than duplicated).

Access policy: exigence 3's literal "Owner ou Admin" wording -> `ROLE.ADMIN`
(this category's existing Admin-level check; `Workspace.owner` is always
ALSO an Admin-role `WorkspaceMember`, the same invariant
`WorkspaceSecurityPolicyEndpoint` already relies on for its own "Admin
reads it, Owner-and-Admin-both is what ROLE.ADMIN actually means here"
reasoning), NOT `IsWorkspaceOwner` - unlike the general
`WorkspaceAuditLogViewSet` (Owner-only, decision #4 of features 3+5),
this feature's own spec (exigence 3, exigence 10) explicitly names both
roles for SCIM specifically, so the SCIM provisioning-log endpoint below
deliberately does NOT reuse that Owner-only viewset/policy - documented
here as the intentional, spec-driven divergence.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.audit import WorkspaceAuditLogListSerializer
from plane.app.serializers.scim import SCIMTokenReadSerializer, SCIMTokenWriteSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import AuditEventType, SCIMToken, Workspace, WorkspaceAuditLog
from plane.scim.authentication import is_scim_enabled
from plane.utils.audit_log import log_audit_event
from plane.utils.audit_log_filters import apply_audit_log_filters
from plane.utils.scim_token import generate_scim_token, hash_scim_token

# Decision #3 - the 4 SCIM-specific AuditEventType choices this feature
# added, scoping the provisioning-log endpoint below to exactly these
# (never the workspace's full general audit log, which is a separate,
# Owner-only surface).
SCIM_EVENT_TYPES = (
    AuditEventType.SCIM_USER_CREATED,
    AuditEventType.SCIM_USER_UPDATED,
    AuditEventType.SCIM_USER_DEACTIVATED,
    AuditEventType.SCIM_SYNC_ERROR,
)


def _scim_disabled_response():
    return Response(
        {"error": "SCIM provisioning is not enabled on this instance. Ask your instance administrator to enable it."},
        status=status.HTTP_403_FORBIDDEN,
    )


class WorkspaceSCIMTokenEndpoint(BaseAPIView):
    """
    GET    /api/workspaces/<slug>/scim/tokens/     - list, masked (exigence 3).
    POST   /api/workspaces/<slug>/scim/tokens/     - create, raw token shown once.
    DELETE /api/workspaces/<slug>/scim/tokens/<pk>/ - revoke (soft-delete,
           matching `ApiTokenEndpoint.delete`'s own precedent for
           `APIToken`).

    Every method is additionally gated by the instance-wide `ENABLE_SCIM`
    flag (exigence 3) - a workspace Owner/Admin cannot create, list, or
    revoke SCIM tokens at all while the instance hasn't enabled SCIM
    globally, regardless of their own role.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        if not is_scim_enabled():
            return _scim_disabled_response()

        tokens = SCIMToken.objects.filter(workspace__slug=slug).order_by("-created_at")
        return Response(SCIMTokenReadSerializer(tokens, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        if not is_scim_enabled():
            return _scim_disabled_response()

        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        label = (request.data.get("label") or "SCIM Token").strip()[:255]

        raw_token = generate_scim_token()
        scim_token = SCIMToken.objects.create(workspace=workspace, token_hash=hash_scim_token(raw_token), label=label)
        # Transient only - never persisted, never re-derivable from
        # `token_hash` (see plane.utils.scim_token's own docstring). This
        # is the ONE response that will ever carry it.
        scim_token._raw_token = raw_token

        # Reuses the existing generic API_TOKEN_CREATED/API_TOKEN_REVOKED
        # event types (not the 4 new SCIM_USER_* ones) - this is a Bearer
        # TOKEN lifecycle event, the same shape personal APIToken
        # creation/revocation already logs, not a SCIM *user*
        # provisioning/deprovisioning event (decision #3's new choices are
        # specifically about the latter).
        log_audit_event(
            AuditEventType.API_TOKEN_CREATED,
            request=request,
            workspace=workspace,
            actor=request.user,
            target_type="SCIMToken",
            target_id=str(scim_token.id),
            metadata={"label": label},
        )

        return Response(SCIMTokenWriteSerializer(scim_token).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        if not is_scim_enabled():
            return _scim_disabled_response()

        scim_token = SCIMToken.objects.filter(workspace__slug=slug, pk=pk).first()
        if scim_token is None:
            return Response({"error": "SCIM token not found"}, status=status.HTTP_404_NOT_FOUND)

        log_audit_event(
            AuditEventType.API_TOKEN_REVOKED,
            request=request,
            workspace=scim_token.workspace,
            actor=request.user,
            target_type="SCIMToken",
            target_id=str(scim_token.id),
            metadata={"label": scim_token.label},
        )
        # Soft-delete (BaseModel's default) - matches ApiTokenEndpoint.
        # delete()'s own `api_token.delete()` precedent for APIToken. The
        # default manager (and so SCIMTokenAuthentication's own lookup)
        # already excludes soft-deleted rows.
        scim_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceSCIMProvisioningLogEndpoint(BaseAPIView):
    """
    GET /api/workspaces/<slug>/scim/provisioning-log/

    A filtered view over the already-shipped `WorkspaceAuditLog` (decision
    #3) - NOT a new model/endpoint family. Reuses the exact same filter
    grammar (`apply_audit_log_filters`) the general audit-log endpoint
    uses, scoped to the 4 SCIM event types. NOT gated by `ENABLE_SCIM` -
    a workspace's past provisioning history remains visible even if an
    instance admin later disables SCIM globally (only NEW token
    management is blocked, see `WorkspaceSCIMTokenEndpoint` above).
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        queryset = apply_audit_log_filters(
            WorkspaceAuditLog.objects.filter(workspace__slug=slug, event_type__in=SCIM_EVENT_TYPES).select_related(
                "actor", "target_user"
            ),
            request.GET,
        )
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda audit_logs: WorkspaceAuditLogListSerializer(audit_logs, many=True).data,
        )
