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
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 6 ("Politiques de securite configurables"),
    # exigence 7/decision - instance-wide ceiling for
    # `WorkspaceSecurityPolicy.session_timeout_minutes`, read by
    # `plane.utils.session_activity.get_instance_max_session_timeout_minutes`.
    # Editable via the existing generic god-mode PATCH endpoint
    # (`plane.license.api.views.configuration.InstanceConfigurationEndpoint`)
    # like every other row in this table - no new view code needed. Default
    # (10080 minutes = 7 days) matches this fork's own `SESSION_COOKIE_AGE`
    # default (604800s, `plane/settings/common.py`) so a freshly-deployed
    # instance sees no practical behavior change from this feature. This
    # entry alone only seeds the key on a genuinely FRESH instance (the
    # `configure_instance` management command that consumes this list runs
    # `get_or_create`) - for already-deployed instances, see the
    # accompanying hand-written data migration
    # `plane.license.migrations.0008_instance_max_session_timeout_config`,
    # which performs the same `get_or_create` at migrate time instead
    # (matching `AUDIT_LOG_RETENTION_DAYS`'s own precedent above).
    {
        "key": "INSTANCE_MAX_SESSION_TIMEOUT_MINUTES",
        "value": os.environ.get("INSTANCE_MAX_SESSION_TIMEOUT_MINUTES", "10080"),
        "category": "SECURITY",
        "is_encrypted": False,
    },
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 2 ("SCIM 2.0 natif"), exigence 3 - instance-
    # wide kill switch, same "0"/"1" string-boolean shape every other
    # god-mode toggle in this table already uses (see `ENABLE_SIGNUP`,
    # `ENABLE_GOOGLE_SYNC`, etc. read via
    # `plane.license.utils.instance_value.get_configuration_value`).
    # Defaults OFF - a workspace Owner/Admin cannot create a SCIM token
    # (`plane.app.views.workspace.scim_admin`) NOR can the `/api/scim/v2/*`
    # protocol surface itself (`plane.scim.authentication.
    # SCIMTokenAuthentication`) authenticate ANY request while this is
    # off, even with an otherwise-valid token - see that module's own
    # docstring for why the protocol layer re-checks this flag live on
    # every request rather than trusting that a token could only exist if
    # SCIM was once enabled. Editable via the existing generic god-mode
    # PATCH endpoint like every other row in this table - no new view code
    # needed for the toggle itself. This entry alone only seeds the key on
    # a genuinely FRESH instance (`configure_instance` runs `get_or_create`)
    # - for already-deployed instances, see the accompanying hand-written
    # data migration `plane.license.migrations.0010_enable_scim_config`,
    # matching `AUDIT_LOG_RETENTION_DAYS`/`INSTANCE_MAX_SESSION_TIMEOUT_MINUTES`'s
    # own precedent above.
    {
        "key": "ENABLE_SCIM",
        "value": os.environ.get("ENABLE_SCIM", "0"),
        "category": "SECURITY",
        "is_encrypted": False,
    },
]
