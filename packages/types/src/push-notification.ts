/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3 ("Notifications push en self-hosted") -
 * frontend types matching `PushNotificationSubscription`
 * (apps/api/plane/db/models/push_notification.py) and
 * `PushNotificationConfig` (apps/api/plane/license/models/push_notification.py)
 * and their serializers/endpoints exactly. See `IUserEmailNotificationSettings`
 * (./users.ts) for the `push_*`/`quiet_hours_*` preference fields, which
 * live on the same `UserNotificationPreference` row as the email fields.
 */

/** `ANDROID`/`IOS` are schema-complete on the backend for forward
 * compatibility only - no real mobile client exists in this fork
 * (categories 12 features 1/2/5 were confirmed as total fabrication and
 * dropped), so `WEB` is the only device type any real frontend flow in
 * this app ever creates. */
export type TPushDeviceType = "WEB" | "ANDROID" | "IOS";

/** `GET /api/users/me/push-subscriptions/` list item ("Connected
 * devices") - `endpoint`/`keys`/`push_token` are never echoed back by the
 * API once stored, see `PushNotificationSubscriptionSerializer`. */
export type TPushNotificationSubscription = {
  id: string;
  device_type: TPushDeviceType;
  user_agent: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
};

/** `POST /api/users/me/push-subscriptions/` body for a Web Push
 * subscription - exactly the shape `PushSubscription.toJSON()` returns
 * from the browser Push API, plus `device_type`. Idempotent upsert on
 * `(user, endpoint)` server-side - safe to POST again on every page load. */
export type TPushSubscriptionCreatePayload = {
  device_type: "WEB";
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

/** God-mode `GET/PATCH /api/instances/configurations/push/`
 * (`InstanceAdminPermission`) - `vapid_private_key`/
 * `fcm_service_account_json`/`apns_auth_key` are write-only and never
 * appear here, matching `WorkspaceAIConfig`'s own established convention;
 * only the derived `is_*_configured` booleans expose whether each secret
 * is set. `VAPID_PUBLIC_KEY` itself is NOT on this model - it lives on
 * the generic `InstanceConfiguration` table instead (see
 * `TInstancePushNotificationConfigurationKeys`,
 * ./instance/push-notification.ts), since it's not a secret and needs to
 * be readable from the public `GET /api/instances/`. */
export type TPushNotificationConfig = {
  id: string;
  vapid_admin_email: string | null;
  apns_key_id: string | null;
  apns_team_id: string | null;
  apns_topic: string | null;
  is_vapid_configured: boolean;
  is_fcm_configured: boolean;
  is_apns_configured: boolean;
  created_at: string;
  updated_at: string;
};

/** `PATCH /api/instances/configurations/push/` payload - a secret key
 * should only ever be included here when the admin actually typed a new
 * value: `PushNotificationConfigEndpoint.patch` only touches a field that
 * is PRESENT in the request body, so omitting an unset/untouched secret
 * leaves the previously stored value intact rather than blanking it. */
export type TPushNotificationConfigUpdatePayload = Partial<{
  vapid_admin_email: string;
  apns_key_id: string;
  apns_team_id: string;
  apns_topic: string;
  vapid_private_key: string;
  fcm_service_account_json: string;
  apns_auth_key: string;
}>;

/** `POST /api/instances/configurations/push/generate-vapid-keys/`
 * response - the private half is generated and stored server-side and is
 * never returned; the public half is also mirrored onto
 * `InstanceConfiguration.VAPID_PUBLIC_KEY` server-side. */
export type TGenerateVapidKeysResponse = {
  vapid_public_key: string;
};

/** `POST /api/instances/configurations/push/test/` response - sends a
 * real test push synchronously to the calling admin's own active WEB
 * subscriptions. */
export type TPushNotificationTestResult = {
  success: boolean;
  results: { subscription_id: string; success: boolean }[];
};
