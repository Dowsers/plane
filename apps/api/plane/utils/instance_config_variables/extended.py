# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os

# Category 11 (docs/feature-specs/11-admin-security-sso.md in
# plane-selfhost), features 3+5 merged, exigence 6/decision #6 -
# `AUDIT_LOG_RETENTION_DAYS`, read by
# `plane.bgtasks.cleanup_task.purge_expired_audit_logs`. Editable via the
# existing generic god-mode PATCH endpoint
# (`plane.license.api.views.configuration.InstanceConfigurationEndpoint`)
# like every other row in this table - no new view code needed. This
# entry alone only seeds the key on a genuinely FRESH instance (the
# `configure_instance` management command that consumes this list runs
# `get_or_create`, so it never touches an already-provisioned instance) -
# for already-deployed instances, see the accompanying hand-written data
# migration `plane.license.migrations.0007_audit_log_retention_config`,
# which performs the same `get_or_create` at migrate time instead.
extended_config_variables = [
    {
        "key": "AUDIT_LOG_RETENTION_DAYS",
        "value": os.environ.get("AUDIT_LOG_RETENTION_DAYS", "90"),
        "category": "SECURITY",
        "is_encrypted": False,
    },
]
