/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
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
import { APIService } from "@/services/api.service";

/**
 * Service for the custom cross-project dashboard builder - see
 * docs/feature-specs/05-insights-analytics.md, section 3. Deliberately
 * named `custom-dashboard.service.ts` (not `dashboard.service.ts`, already
 * taken by the legacy per-user home-page-widget system) to keep the two,
 * unrelated systems unambiguous.
 */
export class CustomDashboardService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // ---------------------------------------------------------------------
  // Dashboards
  // ---------------------------------------------------------------------

  async getDashboards(workspaceSlug: string): Promise<TDashboard[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/dashboards/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getDashboardById(workspaceSlug: string, dashboardId: string): Promise<TDashboard> {
    return this.get(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createDashboard(workspaceSlug: string, data: TDashboardCreatePayload): Promise<TDashboard> {
    return this.post(`/api/workspaces/${workspaceSlug}/dashboards/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateDashboard(
    workspaceSlug: string,
    dashboardId: string,
    data: TDashboardUpdatePayload
  ): Promise<TDashboard> {
    return this.patch(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteDashboard(workspaceSlug: string, dashboardId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---------------------------------------------------------------------
  // Widgets
  // ---------------------------------------------------------------------

  async createWidget(
    workspaceSlug: string,
    dashboardId: string,
    data: TDashboardWidgetCreatePayload
  ): Promise<TDashboardWidget> {
    return this.post(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/widgets/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWidget(
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    data: TDashboardWidgetUpdatePayload
  ): Promise<TDashboardWidget> {
    return this.patch(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/widgets/${widgetId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWidget(workspaceSlug: string, dashboardId: string, widgetId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/widgets/${widgetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Batch position/order save for drag-and-drop - returns the full,
   * updated widget list for the dashboard. */
  async reorderWidgets(
    workspaceSlug: string,
    dashboardId: string,
    data: TDashboardWidgetReorderPayload
  ): Promise<TDashboardWidget[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/widgets/reorder/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Computed data for a single widget - readable by any active workspace
   * member (not owner/admin-gated, unlike every other method here).
   * `params` is only meaningful for `table` widgets (cursor pagination -
   * the standard envelope used everywhere else in this codebase); ignored
   * server-side for chart/kpi widgets. */
  async getWidgetData(
    workspaceSlug: string,
    dashboardId: string,
    widgetId: string,
    params?: { cursor?: string; per_page?: number }
  ): Promise<TDashboardWidgetData> {
    return this.get(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/widgets/${widgetId}/data/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---------------------------------------------------------------------
  // Publish (share link)
  // ---------------------------------------------------------------------

  /** Creates (201) or returns the existing (200) publish info. */
  async publishDashboard(workspaceSlug: string, dashboardId: string): Promise<TDashboardPublishSettings> {
    return this.post(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/publish/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Regenerates the anchor - invalidates the old public URL immediately. */
  async regenerateDashboardPublishLink(workspaceSlug: string, dashboardId: string): Promise<TDashboardPublishSettings> {
    return this.patch(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/publish/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unpublishDashboard(workspaceSlug: string, dashboardId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/publish/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
