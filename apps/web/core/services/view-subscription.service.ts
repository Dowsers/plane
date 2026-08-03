/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { TViewSubscription, TViewSubscriptionPaginatedInfo, TViewSubscriptionWritePayload } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Singular per-user subscription resource on a saved view (project- or
 * workspace-scoped) plus the consolidated "my subscriptions" list - see
 * `ViewSubscriptionViewSet`/`UserViewSubscriptionsEndpoint`
 * (apps/api/plane/app/views/view/subscription.py) and
 * docs/feature-specs/04-views-filters.md ("Abonnements/notifications par
 * vue") in plane-selfhost.
 */
export class ViewSubscriptionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * Returns the current user's subscription on the view, or `undefined` if
   * they haven't subscribed. A 404 here is an expected "no subscription
   * yet" response (not an error condition) per the endpoint's contract, so
   * unlike every other method below it resolves instead of throwing.
   */
  async getSubscription(workspaceSlug: string, viewId: string): Promise<TViewSubscription | undefined> {
    return this.get(`/api/workspaces/${workspaceSlug}/views/${viewId}/subscription/`)
      .then((response) => response?.data)
      .catch((error) => {
        if (error?.response?.status === 404) return undefined;
        throw error?.response?.data;
      });
  }

  /**
   * Create-or-update (upsert) the current user's subscription on the view.
   * Returns 201 on first subscribe, 200 on every subsequent call - callers
   * don't need to distinguish the two, the resulting subscription is the
   * same shape either way.
   */
  async createOrUpdateSubscription(
    workspaceSlug: string,
    viewId: string,
    data: TViewSubscriptionWritePayload = {}
  ): Promise<TViewSubscription> {
    return this.post(`/api/workspaces/${workspaceSlug}/views/${viewId}/subscription/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Partial update of the notify_* toggles - 404s if not subscribed yet. */
  async patchSubscription(
    workspaceSlug: string,
    viewId: string,
    data: TViewSubscriptionWritePayload
  ): Promise<TViewSubscription> {
    return this.patch(`/api/workspaces/${workspaceSlug}/views/${viewId}/subscription/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Unsubscribe - idempotent, always resolves (backend always returns 204). */
  async deleteSubscription(workspaceSlug: string, viewId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/views/${viewId}/subscription/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Consolidated "my subscriptions" list, across every project/view in the workspace. */
  async listMine(workspaceSlug: string): Promise<TViewSubscriptionPaginatedInfo> {
    return this.get(`/api/workspaces/${workspaceSlug}/users/me/view-subscriptions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
