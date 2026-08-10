# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .base import BaseSerializer
from plane.db.models import WorkspaceAPIExplorerSettings


class WorkspaceAPIExplorerSettingsSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceAPIExplorerSettings
        fields = ["id", "workspace_id", "is_enabled", "allow_members_execute"]
        read_only_fields = ["id", "workspace_id"]
