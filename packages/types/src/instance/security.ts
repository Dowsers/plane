/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * god-mode-only `InstanceConfiguration` key(s), category "SECURITY"
 * (apps/api/plane/utils/instance_config_variables/extended.py). The
 * instance-wide ceiling for `WorkspaceSecurityPolicy.session_timeout_minutes`.
 *
 * `ENABLE_SCIM` (feature 2, "SCIM 2.0 natif") joins this same union - the
 * instance-wide kill switch a workspace Owner/Admin's own SCIM token
 * management is gated behind (exigence 3), edited from god-mode
 * Authentication via the same generic `updateInstanceConfigurations`
 * PATCH every other row in this table already uses.
 */
export type TInstanceSecurityConfigurationKeys = "INSTANCE_MAX_SESSION_TIMEOUT_MINUTES" | "ENABLE_SCIM";
