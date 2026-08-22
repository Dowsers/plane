# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), features 3+5 merged, exigence 10 - instance-scoped
audit log (`OAUTH_CONFIG_UPDATED` today, `workspace=None`), god-mode
only. Distinct from the per-workspace audit log
(`plane.app.views.workspace.audit_log`) - this one uses whatever
permission already gates every other god-mode-only endpoint
(`InstanceAdminPermission`, the `plane.license.api.views.base.BaseAPIView`
default), not the workspace-level `IsWorkspaceOwner`.
"""

from .base import BaseAPIView
from plane.app.serializers.audit import WorkspaceAuditLogSerializer
from plane.db.models import WorkspaceAuditLog


class InstanceAuditLogEndpoint(BaseAPIView):
    """GET /api/instances/audit-logs/ - instance-scoped events only
    (`workspace__isnull=True`) - never returns a workspace-scoped entry,
    regardless of query params (exigence 13's scoping discipline applies
    here too, just inverted: this endpoint's whole job is to stay OUT of
    every workspace's own log)."""

    def get(self, request):
        queryset = WorkspaceAuditLog.objects.filter(workspace__isnull=True).select_related("actor", "target_user")

        event_type = request.GET.get("event_type")
        if event_type:
            queryset = queryset.filter(event_type__in=[v for v in event_type.split(",") if v])

        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda audit_logs: WorkspaceAuditLogSerializer(audit_logs, many=True).data,
        )
