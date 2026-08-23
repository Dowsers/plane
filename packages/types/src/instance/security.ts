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
 */
export type TInstanceSecurityConfigurationKeys = "INSTANCE_MAX_SESSION_TIMEOUT_MINUTES";
