/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import { SitesDashboardService } from "@plane/services";
import type { TPublicDashboard } from "@plane/types";
// store
import { DashboardPublishStore } from "@/store/dashboards/dashboard-publish.store";
import type { RootStore } from "@/store/root.store";

/**
 * Mirrors `PublishListStore` (`store/publish/publish_list.store.ts`) for
 * the equivalent project-publish flow - a cache of `DashboardPublishStore`
 * instances keyed by anchor, populated by `fetchDashboard`.
 */
export interface IDashboardPublishListStore {
  // observables
  dashboardMap: Record<string, DashboardPublishStore>; // anchor => DashboardPublishStore
  // actions
  fetchDashboard: (anchor: string) => Promise<TPublicDashboard>;
}

export class DashboardPublishListStore implements IDashboardPublishListStore {
  // observables
  dashboardMap: Record<string, DashboardPublishStore> = {}; // anchor => DashboardPublishStore
  // service
  dashboardService;

  constructor(private rootStore: RootStore) {
    makeObservable(this, {
      // observables
      dashboardMap: observable,
      // actions
      fetchDashboard: action,
    });
    // services
    this.dashboardService = new SitesDashboardService();
  }

  /**
   * @description fetch a published dashboard's metadata + widget config by
   * its public anchor
   * @param {string} anchor
   */
  fetchDashboard = async (anchor: string) => {
    const response = await this.dashboardService.retrieveByAnchor(anchor);
    runInAction(() => {
      if (response.id) {
        set(this.dashboardMap, [anchor], new DashboardPublishStore(this.rootStore, response));
      }
    });
    return response;
  };
}
