/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { SitesDashboardService } from "@plane/services";
import type { TDashboardWidgetKpiData, TPublicDashboardWidget } from "@plane/types";
// local imports
import { PublicWidgetDataState } from "../widget-data-state";

type Props = {
  anchor: string;
  widget: Extract<TPublicDashboardWidget, { widget_type: "kpi" }>;
};

const dashboardService = new SitesDashboardService();

export function PublicKpiWidget({ anchor, widget }: Props) {
  const { t } = useTranslation();

  const { data, error, isLoading } = useSWR(
    `PUBLIC_DASHBOARD_WIDGET_DATA_${anchor}_${widget.id}`,
    () => dashboardService.retrieveWidgetData(anchor, widget.id) as Promise<TDashboardWidgetKpiData>,
    { revalidateOnFocus: false }
  );

  const isPercentage = widget.config.metric === "completion_rate";

  return (
    <PublicWidgetDataState isLoading={isLoading} error={error}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-2">
        <div className="text-32 font-bold text-primary">
          {data?.value ?? 0}
          {isPercentage ? "%" : ""}
        </div>
        <div className="text-13 text-tertiary">
          {t(`workspace_dashboards.widget.kpi.metrics.${widget.config.metric}`)}
        </div>
      </div>
    </PublicWidgetDataState>
  );
}
