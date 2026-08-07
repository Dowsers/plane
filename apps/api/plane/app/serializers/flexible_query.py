# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .base import BaseSerializer
from plane.db.models import WorkspaceQuerySettings


class WorkspaceQuerySettingsSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceQuerySettings
        fields = ["id", "workspace_id", "max_depth", "max_cost", "timeout_ms"]
        read_only_fields = ["id", "workspace_id"]
