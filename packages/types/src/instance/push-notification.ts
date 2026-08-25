/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3 ("Notifications push en self-hosted") - the
 * two non-secret `InstanceConfiguration` keys (category `PUSH_NOTIFICATIONS`,
 * apps/api/plane/utils/instance_config_variables/extended.py), editable via
 * the existing generic god-mode `PATCH /api/instances/configurations/`
 * like every other row in this table:
 * - `PUSH_NOTIFICATIONS_ENABLED` - instance-wide kill switch (exigence 10),
 *   `"0"`/`"1"`, defaults to `"0"` (no surprise activation on upgrade).
 * - `VAPID_PUBLIC_KEY` - not a secret, handed to every subscribing
 *   browser as the Web Push `applicationServerKey`.
 * Everything genuinely secret (`vapid_private_key`) or admin-only
 * (`vapid_admin_email`, FCM/APNs credentials) lives instead on the
 * dedicated `TPushNotificationConfig` model (../push-notification.ts),
 * reachable only via `/api/instances/configurations/push/`.
 */
export type TInstancePushNotificationConfigurationKeys = "PUSH_NOTIFICATIONS_ENABLED" | "VAPID_PUBLIC_KEY";
