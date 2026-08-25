/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TPushNotificationSubscription, TPushSubscriptionCreatePayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3 ("Notifications push en self-hosted") -
 * user-facing Web Push subscription CRUD
 * (`plane.app.views.notification.push_subscription`). A dedicated
 * service (rather than folding onto `UserService`) matching this app's
 * own precedent for a self-contained feature surface (`DigestService`,
 * `AgentService`) even when the endpoints live under `/api/users/me/...`.
 */
export class PushNotificationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** "Connected devices" list (exigence 12) - active subscriptions only,
   * newest first. Never includes `endpoint`/`keys` - see
   * `TPushNotificationSubscription`'s own doc comment. */
  async listSubscriptions(): Promise<TPushNotificationSubscription[]> {
    return this.get("/api/users/me/push-subscriptions/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Registers (or idempotently refreshes, on `(user, endpoint)`
   * collision) a Web Push subscription for the current browser -
   * `data` is exactly `PushSubscription.toJSON()` plus `device_type`. */
  async createSubscription(data: TPushSubscriptionCreatePayload): Promise<TPushNotificationSubscription> {
    return this.post("/api/users/me/push-subscriptions/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Revokes a subscription (exigence 12's "manage my devices" screen). */
  async revokeSubscription(id: string): Promise<void> {
    return this.delete(`/api/users/me/push-subscriptions/${id}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
