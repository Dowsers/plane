/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TDashboardWidgetData, TPublicDashboard } from "@plane/types";
// api service
import { APIService } from "../api.service";

/**
 * Service class for the public (unauthenticated), read-only custom
 * dashboard endpoints - see docs/feature-specs/05-insights-analytics.md,
 * section 3. Mirrors `SitesProjectPublishService` (`./sites-publish.service`)
 * for the equivalent project-publish flow.
 * @extends {APIService}
 * @remarks This service is only available for plane sites (`apps/space`)
 */
export class SitesDashboardService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  /**
   * Retrieves a published dashboard's metadata + widget config/layout by
   * its public anchor. Deliberately does NOT include computed widget data
   * (kept cheap for SSR meta + initial paint) - see
   * `retrieveWidgetData` below.
   * @param {string} anchor - The dashboard's public anchor token
   * @returns {Promise<TPublicDashboard>}
   * @throws {Error} If the API request fails (e.g. 404 when unpublished)
   */
  async retrieveByAnchor(anchor: string): Promise<TPublicDashboard> {
    return this.get(`/api/public/dashboards/${anchor}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Retrieves computed data for a single widget on a published dashboard.
   * No authentication/membership check - scoped entirely to the widget's
   * own stored `project_ids`. Rate-limited (60/min per anchor+IP) - a 429
   * is possible under heavy refresh.
   * `params` is only meaningful for `table` widgets (cursor pagination -
   * the standard envelope used everywhere else in this codebase); ignored
   * server-side for chart/kpi widgets.
   * @param {string} anchor - The dashboard's public anchor token
   * @param {string} widgetId - The widget's id
   * @returns {Promise<TDashboardWidgetData>}
   * @throws {Error} If the API request fails
   */
  async retrieveWidgetData(
    anchor: string,
    widgetId: string,
    params?: { cursor?: string; per_page?: number }
  ): Promise<TDashboardWidgetData> {
    return this.get(`/api/public/dashboards/${anchor}/widgets/${widgetId}/data/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }
}
