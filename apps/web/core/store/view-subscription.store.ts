/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { TViewSubscription, TViewSubscriptionWritePayload } from "@plane/types";
// services
import { ViewSubscriptionService } from "@/services/view-subscription.service";
// store
import type { CoreRootStore } from "./root.store";

/**
 * Tracks the current user's personal subscription on saved views (project-
 * or workspace-scoped, same underlying `IssueView` model) plus the
 * consolidated "my subscriptions" list - see
 * docs/feature-specs/04-views-filters.md ("Abonnements/notifications par
 * vue") in plane-selfhost.
 */
export interface IViewSubscriptionStore {
  // loader
  loader: boolean;
  myLoader: boolean;
  // observables
  fetchedViewIds: Record<string, boolean>;
  // viewId -> subscription, or null once we know the user isn't subscribed
  subscriptionMap: Record<string, TViewSubscription | null>;
  myFetchedWorkspaces: Record<string, boolean>;
  mySubscriptionsMap: Record<string, TViewSubscription>; // subscription id -> subscription
  myWorkspaceSubscriptionIdsMap: Record<string, string[]>; // workspaceSlug -> subscription ids

  // computed actions
  getSubscriptionByViewId: (viewId: string) => TViewSubscription | null | undefined;
  getMySubscriptionIds: (workspaceSlug: string) => string[] | null;
  getMySubscriptionById: (subscriptionId: string) => TViewSubscription | undefined;

  // fetch
  fetchSubscription: (workspaceSlug: string, viewId: string) => Promise<TViewSubscription | undefined>;
  fetchMySubscriptions: (workspaceSlug: string) => Promise<TViewSubscription[]>;

  // actions
  subscribeToView: (
    workspaceSlug: string,
    viewId: string,
    data?: TViewSubscriptionWritePayload
  ) => Promise<TViewSubscription>;
  updateSubscription: (
    workspaceSlug: string,
    viewId: string,
    data: TViewSubscriptionWritePayload
  ) => Promise<TViewSubscription>;
  unsubscribeFromView: (workspaceSlug: string, viewId: string) => Promise<void>;
}

export class ViewSubscriptionStore implements IViewSubscriptionStore {
  // observables
  loader: boolean = false;
  myLoader: boolean = false;
  fetchedViewIds: Record<string, boolean> = {};
  subscriptionMap: Record<string, TViewSubscription | null> = {};
  myFetchedWorkspaces: Record<string, boolean> = {};
  mySubscriptionsMap: Record<string, TViewSubscription> = {};
  myWorkspaceSubscriptionIdsMap: Record<string, string[]> = {};
  // root store
  rootStore;
  // services
  viewSubscriptionService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      myLoader: observable.ref,
      fetchedViewIds: observable,
      subscriptionMap: observable,
      myFetchedWorkspaces: observable,
      mySubscriptionsMap: observable,
      myWorkspaceSubscriptionIdsMap: observable,

      fetchSubscription: action,
      fetchMySubscriptions: action,
      subscribeToView: action,
      updateSubscription: action,
      unsubscribeFromView: action,
    });

    this.rootStore = _rootStore;
    this.viewSubscriptionService = new ViewSubscriptionService();
  }

  getSubscriptionByViewId = computedFn((viewId: string): TViewSubscription | null | undefined => {
    if (!this.fetchedViewIds[viewId]) return undefined;
    return this.subscriptionMap[viewId] ?? null;
  });

  getMySubscriptionIds = computedFn((workspaceSlug: string): string[] | null => {
    if (!this.myFetchedWorkspaces[workspaceSlug]) return null;
    return this.myWorkspaceSubscriptionIdsMap[workspaceSlug] ?? [];
  });

  getMySubscriptionById = computedFn(
    (subscriptionId: string): TViewSubscription | undefined => this.mySubscriptionsMap?.[subscriptionId]
  );

  /** Merge a fresh subscription into the "my subscriptions" caches, if that list has already been loaded. */
  private upsertIntoMySubscriptions = (workspaceSlug: string, subscription: TViewSubscription) => {
    if (!this.myFetchedWorkspaces[workspaceSlug]) return;
    set(this.mySubscriptionsMap, [subscription.id], subscription);
    const existingIds = this.myWorkspaceSubscriptionIdsMap[workspaceSlug] ?? [];
    if (!existingIds.includes(subscription.id)) {
      set(this.myWorkspaceSubscriptionIdsMap, [workspaceSlug], [...existingIds, subscription.id]);
    }
  };

  /** Remove a view's subscription from the "my subscriptions" caches (unsubscribe / deactivate). */
  private removeFromMySubscriptions = (workspaceSlug: string, viewId: string) => {
    const subscriptionId = Object.values(this.mySubscriptionsMap).find((sub) => sub.issue_view === viewId)?.id;
    if (!subscriptionId) return;
    delete this.mySubscriptionsMap[subscriptionId];
    const existingIds = this.myWorkspaceSubscriptionIdsMap[workspaceSlug] ?? [];
    set(
      this.myWorkspaceSubscriptionIdsMap,
      [workspaceSlug],
      existingIds.filter((id) => id !== subscriptionId)
    );
  };

  fetchSubscription = async (workspaceSlug: string, viewId: string): Promise<TViewSubscription | undefined> => {
    this.loader = true;
    try {
      const response = await this.viewSubscriptionService.getSubscription(workspaceSlug, viewId);
      runInAction(() => {
        set(this.subscriptionMap, [viewId], response ?? null);
        set(this.fetchedViewIds, viewId, true);
        this.loader = false;
      });
      return response;
    } catch (error) {
      this.loader = false;
      throw error;
    }
  };

  fetchMySubscriptions = async (workspaceSlug: string): Promise<TViewSubscription[]> => {
    this.myLoader = true;
    try {
      const response = await this.viewSubscriptionService.listMine(workspaceSlug);
      const results = response?.results ?? [];
      runInAction(() => {
        results.forEach((subscription) => {
          set(this.mySubscriptionsMap, [subscription.id], subscription);
        });
        set(
          this.myWorkspaceSubscriptionIdsMap,
          [workspaceSlug],
          results.map((subscription) => subscription.id)
        );
        set(this.myFetchedWorkspaces, workspaceSlug, true);
        this.myLoader = false;
      });
      return results;
    } catch (error) {
      this.myLoader = false;
      throw error;
    }
  };

  subscribeToView = async (
    workspaceSlug: string,
    viewId: string,
    data: TViewSubscriptionWritePayload = {}
  ): Promise<TViewSubscription> => {
    const response = await this.viewSubscriptionService.createOrUpdateSubscription(workspaceSlug, viewId, data);
    runInAction(() => {
      set(this.subscriptionMap, [viewId], response);
      set(this.fetchedViewIds, viewId, true);
      this.upsertIntoMySubscriptions(workspaceSlug, response);
    });
    return response;
  };

  updateSubscription = async (
    workspaceSlug: string,
    viewId: string,
    data: TViewSubscriptionWritePayload
  ): Promise<TViewSubscription> => {
    const before = this.subscriptionMap[viewId];
    try {
      runInAction(() => {
        if (before) set(this.subscriptionMap, [viewId], { ...before, ...data });
      });
      const response = await this.viewSubscriptionService.patchSubscription(workspaceSlug, viewId, data);
      runInAction(() => {
        set(this.subscriptionMap, [viewId], response);
        this.upsertIntoMySubscriptions(workspaceSlug, response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (before !== undefined) set(this.subscriptionMap, [viewId], before);
      });
      throw error;
    }
  };

  unsubscribeFromView = async (workspaceSlug: string, viewId: string): Promise<void> => {
    const before = this.subscriptionMap[viewId];
    try {
      runInAction(() => {
        set(this.subscriptionMap, [viewId], null);
      });
      await this.viewSubscriptionService.deleteSubscription(workspaceSlug, viewId);
      runInAction(() => {
        set(this.fetchedViewIds, viewId, true);
        this.removeFromMySubscriptions(workspaceSlug, viewId);
      });
    } catch (error) {
      runInAction(() => {
        if (before !== undefined) set(this.subscriptionMap, [viewId], before);
      });
      throw error;
    }
  };
}
