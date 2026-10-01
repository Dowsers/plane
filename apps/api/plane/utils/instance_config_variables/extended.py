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
    # Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
    # plane-selfhost), feature 3 ("Notifications push en self-hosted"),
    # exigence 10 - instance-wide kill switch. Defaults OFF ("pas
    # d'activation surprise" - the spec's own explicit requirement for an
    # existing instance being upgraded). `plane.bgtasks.
    # push_notification_task.send_push_notification` re-checks this live
    # on every single push attempt (not just at subscribe time), same
    # "protocol layer re-checks the flag live" convention `ENABLE_SCIM`
    # already established above. Also surfaced on the PUBLIC
    # `GET /api/instances/` (`InstanceEndpoint`) - see that view - so a
    # user's browser can decide whether to even offer the "enable push"
    # toggle without needing admin access. Editable via the existing
    # generic god-mode PATCH endpoint like every other row in this table -
    # no new view code needed for the toggle itself. VAPID/FCM/APNs
    # SECRETS are deliberately NOT here - see
    # `plane.license.models.push_notification.PushNotificationConfig`'s
    # own docstring for why those live on a dedicated model instead (the
    # false "write-only" precedent this exact table has today for
    # `EMAIL_HOST_PASSWORD`/`LLM_API_KEY`).
    {
        "key": "PUSH_NOTIFICATIONS_ENABLED",
        "value": os.environ.get("PUSH_NOTIFICATIONS_ENABLED", "0"),
        "category": "PUSH_NOTIFICATIONS",
        "is_encrypted": False,
    },
    # Not a secret - handed to every subscribing browser as the Web Push
    # `applicationServerKey`. Written by
    # `plane.license.api.views.push_notification.
    # GenerateVapidKeysEndpoint` (or an admin pasting an externally-
    # generated key pair via the ordinary god-mode PATCH endpoint), read
    # back by the same public `GET /api/instances/` as the kill switch
    # above.
    {
        "key": "VAPID_PUBLIC_KEY",
        "value": os.environ.get("VAPID_PUBLIC_KEY", ""),
        "category": "PUSH_NOTIFICATIONS",
        "is_encrypted": False,
    },
    # Inspection compliance (ISO/IEC 17020 §4.1/§4.2) - instance-wide kill
    # switch for the ENFORCEMENT half of the feature, same "0"/"1"
    # string-boolean shape as `ENABLE_SCIM`/`PUSH_NOTIFICATIONS_ENABLED`
    # above, read via `plane.utils.inspection_compliance.
    # is_instance_enforcement_enabled` on every project-scoped request.
    #
    # Defaults OFF, and more deliberately than its siblings: this gate can deny
    # READS of a project, so it must never switch itself on during an upgrade.
    # With it off, flagging a project as an inspection still records
    # obligations, shows the non-compliance banner and sends reminders - it
    # simply blocks nobody. Turning it on is a conscious act, and the one
    # instance-wide way back out of a lockout.
    #
    # This entry alone only seeds the key on a genuinely FRESH instance
    # (`configure_instance` runs `get_or_create`) - for already-deployed
    # instances see the accompanying data migration
    # `plane.license.migrations.0013_enable_inspection_enforcement_config`,
    # matching `ENABLE_SCIM`'s own precedent.
    {
        "key": "ENABLE_INSPECTION_ENFORCEMENT",
        "value": os.environ.get("ENABLE_INSPECTION_ENFORCEMENT", "0"),
        "category": "SECURITY",
        "is_encrypted": False,
    },
]
