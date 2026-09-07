/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "../users";
import type {
  TInstanceAIConfigurationKeys,
  TInstanceEmailConfigurationKeys,
  TInstanceImageConfigurationKeys,
  TInstanceAuthenticationKeys,
  TInstancePushNotificationConfigurationKeys,
  TInstanceSecurityConfigurationKeys,
  TInstanceWorkspaceConfigurationKeys,
  TCoreLoginMediums,
} from "./";
import type { TExtendedLoginMediums } from "./auth-ee";

export interface IInstanceInfo {
  instance: IInstance;
  config: IInstanceConfig;
}

export interface IInstance {
  id: string;
  created_at: string;
  updated_at: string;
  instance_name: string | undefined;
  whitelist_emails: string | undefined;
  instance_id: string | undefined;
  license_key: string | undefined;
  current_version: string | undefined;
  latest_version: string | undefined;
  last_checked_at: string | undefined;
  namespace: string | undefined;
  is_telemetry_enabled: boolean;
  is_support_required: boolean;
  is_activated: boolean;
  is_setup_done: boolean;
  is_signup_screen_visited: boolean;
  user_count: number | undefined;
  is_verified: boolean;
  created_by: string | undefined;
  updated_by: string | undefined;
  workspaces_exist: boolean;
}

export interface IInstanceConfig {
  enable_signup: boolean;
  is_workspace_creation_disabled: boolean;
  is_google_enabled: boolean;
  is_github_enabled: boolean;
  is_gitlab_enabled: boolean;
  is_gitea_enabled: boolean;
  is_magic_login_enabled: boolean;
  is_email_password_enabled: boolean;
  github_app_name: string | undefined;
  slack_client_id: string | undefined;
  posthog_api_key: string | undefined;
  posthog_host: string | undefined;
  has_unsplash_configured: boolean;
  has_llm_configured: boolean;
  file_size_limit: number | undefined;
  is_smtp_configured: boolean;
  app_base_url: string | undefined;
  space_base_url: string | undefined;
  admin_base_url: string | undefined;
  is_self_managed: boolean;
  instance_changelog_url?: string;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 2 ("SCIM 2.0 natif") - the instance-wide
  // `ENABLE_SCIM` god-mode flag (`InstanceConfiguration`, category
  // SECURITY), mirrored onto this PUBLIC config payload (small backend
  // addition alongside this same frontend checkpoint,
  // `plane.license.api.views.instance.InstanceEndpoint.get`) so Workspace
  // Settings > Security's own "SCIM Provisioning" tab can gate its own
  // visibility on it per the spec ("visible uniquement si ENABLE_SCIM est
  // active cote instance") - apps/web has no access to the privileged
  // `GET /api/instances/configurations/` surface apps/admin's own god-mode
  // toggle reads/writes.
  is_scim_enabled: boolean;
  // Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
  // plane-selfhost), feature 3 ("Notifications push en self-hosted") -
  // both surfaced on this PUBLIC/`AllowAny` payload (not just god-mode)
  // because a signed-in user's own browser needs them to decide whether
  // to even offer the "enable push" toggle (Profile > Notifications) and,
  // if so, to call `pushManager.subscribe({applicationServerKey:
  // vapid_public_key})` - see `plane.license.api.views.instance.
  // InstanceEndpoint.get`. Neither is a secret; `vapid_private_key` and
  // the FCM/APNs credentials are god-mode-only
  // (`GET /api/instances/configurations/push/`, TPushNotificationConfig).
  is_push_notifications_enabled: boolean;
  vapid_public_key: string | undefined;
}

export interface IInstanceAdmin {
  created_at: string;
  created_by: string;
  id: string;
  instance: string;
  role: string;
  updated_at: string;
  updated_by: string;
  user: string;
  user_detail: IUserLite;
}

export type TInstanceConfigurationKeys =
  | TInstanceAIConfigurationKeys
  | TInstanceEmailConfigurationKeys
  | TInstanceImageConfigurationKeys
  | TInstanceAuthenticationKeys
  | TInstancePushNotificationConfigurationKeys
  | TInstanceSecurityConfigurationKeys
  | TInstanceWorkspaceConfigurationKeys;

export interface IInstanceConfiguration {
  id: string;
  created_at: string;
  updated_at: string;
  key: TInstanceConfigurationKeys;
  value: string;
  created_by: string | null;
  updated_by: string | null;
}

export type IFormattedInstanceConfiguration = {
  [key in TInstanceConfigurationKeys]: string;
};

export type TLoginMediums = TCoreLoginMediums | TExtendedLoginMediums;

/**
 * Instance-wide rate-limit tier (`RateLimitTier`, apps/api/plane/db/models/
 * rate_limit.py) - Instance Admin (God Mode) only, see
 * `RateLimitTierEndpoint` (apps/api/plane/license/api/views/rate_limit.py).
 * Only 3 rows exist in this fork (`session_web`/`personal_token`/
 * `service_account`) - `key`/`is_default` are read-only, only
 * `requests_per_minute`/`requests_per_hour` are ever edited from God Mode.
 */
export interface IRateLimitTier {
  id: string;
  key: string;
  requests_per_minute: number;
  requests_per_hour: number;
  complexity_points_per_hour: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Response of the God Mode "generate a password reset link for a user"
 * action (`AdminUserPasswordResetLinkEndpoint`, apps/api/plane/license/api/
 * views/admin.py) - used when the instance has no SMTP configured, so the
 * normal emailed forgot-password flow is unavailable. `reset_link` points
 * at the pre-existing `/accounts/reset-password` page/flow and is returned
 * once, never emailed - the instance admin relays it to the user directly.
 */
export type TUserPasswordResetLinkResponse = {
  reset_link: string;
  email: string;
};
