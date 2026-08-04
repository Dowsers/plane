/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  TDashboard,
  TDashboardCreatePayload,
  TDashboardPublishSettings,
  TDashboardUpdatePayload,
  TDashboardWidget,
  TDashboardWidgetCreatePayload,
  TDashboardWidgetData,
  TDashboardWidgetReorderPayload,
  TDashboardWidgetUpdatePayload,
} from "@plane/types";
// services
import { CustomDashboardService } from "@/services/custom-dashboard.service";
// store
import type { CoreRootStore } from "./root.store";

/**
 * Store for the custom cross-project dashboard builder - see
 * docs/feature-specs/05-insights-analytics.md, section 3. Deliberately
 * named `CustomDashboardStore`/`custom-dashboard.store.ts` (not
 * `DashboardStore`/`dashboard.store.ts`, already taken by the legacy
 * per-user home-page-widget system registered on the root store as
 * `rootStore.dashboard`) - registered as `rootStore.customDashboard`
 * instead, so the two, unrelated systems never collide.
 *
 * Widget *data* (the computed chart/kpi/table payloads from
 * `.../widgets/<id>/data/`) is deliberately NOT cached here - each widget
 * cell fetches its own data via SWR at the component level (same pattern
 * `apps/web/core/components/analytics/work-items/priority-chart.tsx`
 * already uses for the legacy single-project analytics charts), keyed by
 * widget id so re-renders/re-fetches are naturally scoped per widget.
 */
export interface ICustomDashboardStore {
  // observables
  loader: boolean;
  fetchedAll: boolean;
  dashboardMap: Record<string, TDashboard>;
  // computed
  dashboardIds: string[] | undefined;
  // computed actions
  getDashboardById: (dashboardId: string) => TDashboard | undefined;
  // fetch actions
  fetchDashboards: (workspaceSlug: string) => Promise<TDashboard[] | undefined>;
  fetchDashboardDetails: (workspaceSlug: string, dashboardId: string) => Promise<TDashboard>;
  // dashboard CRUD
  createDashboard: (workspaceSlug: string, data: TDashboardCreatePayload) => Promise<TDashboard>;
  updateDashboard: (workspaceSlug: string, dashboardId: string, data: TDashboardUpdatePayload) => Promise<TDashboard>;
  deleteDashboard: (workspaceSlug: string, dashboardId: string) => Promise<void>;
  // widget CRUD
  createWidget: (
    workspaceSlug: string,
    dashboardId: string,
    data: TDashboardWidgetCreatePayload
  ) => Promise<TDashboardWidget>;
  updateWidget: (
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    data: TDashboardWidgetUpdatePayload
  ) => Promise<TDashboardWidget>;
  deleteWidget: (workspaceSlug: string, dashboardId: string, widgetId: string) => Promise<void>;
  reorderWidgets: (
    workspaceSlug: string,
    dashboardId: string,
    data: TDashboardWidgetReorderPayload
  ) => Promise<TDashboardWidget[]>;
  getWidgetData: (
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    params?: { cursor?: string; per_page?: number }
  ) => Promise<TDashboardWidgetData>;
  // publish
  publishDashboard: (workspaceSlug: string, dashboardId: string) => Promise<TDashboardPublishSettings>;
  regenerateDashboardPublishLink: (workspaceSlug: string, dashboardId: string) => Promise<TDashboardPublishSettings>;
  unpublishDashboard: (workspaceSlug: string, dashboardId: string) => Promise<void>;
}

export class CustomDashboardStore implements ICustomDashboardStore {
  // observables
  loader: boolean = false;
  fetchedAll: boolean = false;
  dashboardMap: Record<string, TDashboard> = {};
  // root store
  rootStore;
  // services
  customDashboardService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      fetchedAll: observable.ref,
      dashboardMap: observable,
      // computed
      dashboardIds: computed,
      // fetch actions
      fetchDashboards: action,
      fetchDashboardDetails: action,
      // dashboard CRUD
      createDashboard: action,
      updateDashboard: action,
      deleteDashboard: action,
      // widget CRUD
      createWidget: action,
      updateWidget: action,
      deleteWidget: action,
      reorderWidgets: action,
      // publish
      publishDashboard: action,
      regenerateDashboardPublishLink: action,
      unpublishDashboard: action,
    });
    // root store
    this.rootStore = _rootStore;
    // services
    this.customDashboardService = new CustomDashboardService();
  }

  /** Ids of every dashboard fetched so far, newest first (matches the
   * backend's own default `-created_at` ordering). */
  get dashboardIds() {
    if (!this.fetchedAll) return undefined;
    const dashboards = Object.values(this.dashboardMap);
    // eslint-disable-next-line unicorn/no-array-sort -- freshly-built local array from Object.values, no shared-reference mutation risk; toSorted() needs an ES2023 lib bump out of scope here
    dashboards.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return dashboards.map((dashboard) => dashboard.id);
  }

  getDashboardById = computedFn((dashboardId: string) => this.dashboardMap?.[dashboardId] ?? undefined);

  // ---------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------

  fetchDashboards = async (workspaceSlug: string) => {
    try {
      this.loader = true;
      const response = await this.customDashboardService.getDashboards(workspaceSlug);
      runInAction(() => {
        response.forEach((dashboard) => set(this.dashboardMap, [dashboard.id], dashboard));
        this.fetchedAll = true;
        this.loader = false;
      });
      return response;
    } catch (error) {
      this.loader = false;
      throw error;
    }
  };

  fetchDashboardDetails = async (workspaceSlug: string, dashboardId: string) => {
    const response = await this.customDashboardService.getDashboardById(workspaceSlug, dashboardId);
    runInAction(() => {
      set(this.dashboardMap, [dashboardId], response);
    });
    return response;
  };

  // ---------------------------------------------------------------------
  // Dashboard CRUD
  // ---------------------------------------------------------------------

  createDashboard = async (workspaceSlug: string, data: TDashboardCreatePayload) => {
    const response = await this.customDashboardService.createDashboard(workspaceSlug, data);
    runInAction(() => {
      set(this.dashboardMap, [response.id], response);
    });
    return response;
  };

  updateDashboard = async (workspaceSlug: string, dashboardId: string, data: TDashboardUpdatePayload) => {
    const currentDashboard = this.getDashboardById(dashboardId);
    runInAction(() => {
      set(this.dashboardMap, [dashboardId], { ...currentDashboard, ...data });
    });
    try {
      const response = await this.customDashboardService.updateDashboard(workspaceSlug, dashboardId, data);
      runInAction(() => {
        set(this.dashboardMap, [dashboardId], response);
      });
      return response;
    } catch (error) {
      // roll back on failure
      if (currentDashboard) runInAction(() => set(this.dashboardMap, [dashboardId], currentDashboard));
      throw error;
    }
  };

  deleteDashboard = async (workspaceSlug: string, dashboardId: string) => {
    await this.customDashboardService.deleteDashboard(workspaceSlug, dashboardId);
    runInAction(() => {
      delete this.dashboardMap[dashboardId];
    });
  };

  // ---------------------------------------------------------------------
  // Widget CRUD - kept inline on `dashboardMap[dashboardId].widgets`
  // ---------------------------------------------------------------------

  createWidget = async (workspaceSlug: string, dashboardId: string, data: TDashboardWidgetCreatePayload) => {
    const response = await this.customDashboardService.createWidget(workspaceSlug, dashboardId, data);
    runInAction(() => {
      const dashboard = this.getDashboardById(dashboardId);
      if (!dashboard) return;
      set(this.dashboardMap, [dashboardId, "widgets"], [...dashboard.widgets, response]);
    });
    return response;
  };

  updateWidget = async (
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    data: TDashboardWidgetUpdatePayload
  ) => {
    const response = await this.customDashboardService.updateWidget(workspaceSlug, dashboardId, widgetId, data);
    runInAction(() => {
      const dashboard = this.getDashboardById(dashboardId);
      if (!dashboard) return;
      set(
        this.dashboardMap,
        [dashboardId, "widgets"],
        dashboard.widgets.map((widget) => (widget.id === widgetId ? response : widget))
      );
    });
    return response;
  };

  deleteWidget = async (workspaceSlug: string, dashboardId: string, widgetId: string) => {
    await this.customDashboardService.deleteWidget(workspaceSlug, dashboardId, widgetId);
    runInAction(() => {
      const dashboard = this.getDashboardById(dashboardId);
      if (!dashboard) return;
      set(
        this.dashboardMap,
        [dashboardId, "widgets"],
        dashboard.widgets.filter((widget) => widget.id !== widgetId)
      );
    });
  };

  reorderWidgets = async (workspaceSlug: string, dashboardId: string, data: TDashboardWidgetReorderPayload) => {
    const response = await this.customDashboardService.reorderWidgets(workspaceSlug, dashboardId, data);
    runInAction(() => {
      set(this.dashboardMap, [dashboardId, "widgets"], response);
    });
    return response;
  };

  getWidgetData = async (
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    params?: { cursor?: string; per_page?: number }
  ) => this.customDashboardService.getWidgetData(workspaceSlug, dashboardId, widgetId, params);

  // ---------------------------------------------------------------------
  // Publish (share link)
  // ---------------------------------------------------------------------

  publishDashboard = async (workspaceSlug: string, dashboardId: string) => {
    const response = await this.customDashboardService.publishDashboard(workspaceSlug, dashboardId);
    runInAction(() => {
      set(this.dashboardMap, [dashboardId, "anchor"], response.anchor);
      set(this.dashboardMap, [dashboardId, "is_published"], response.is_published);
    });
    return response;
  };

  regenerateDashboardPublishLink = async (workspaceSlug: string, dashboardId: string) => {
    const response = await this.customDashboardService.regenerateDashboardPublishLink(workspaceSlug, dashboardId);
    runInAction(() => {
      set(this.dashboardMap, [dashboardId, "anchor"], response.anchor);
      set(this.dashboardMap, [dashboardId, "is_published"], response.is_published);
    });
    return response;
  };

  unpublishDashboard = async (workspaceSlug: string, dashboardId: string) => {
    await this.customDashboardService.unpublishDashboard(workspaceSlug, dashboardId);
    runInAction(() => {
      set(this.dashboardMap, [dashboardId, "anchor"], null);
      set(this.dashboardMap, [dashboardId, "is_published"], false);
    });
  };
}
