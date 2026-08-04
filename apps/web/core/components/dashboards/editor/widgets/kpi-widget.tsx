/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TDashboardWidget, TDashboardWidgetKpiData } from "@plane/types";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
// local imports
import { WidgetDataStateWrapper } from "./widget-data-state-wrapper";

type Props = {
  workspaceSlug: string;
  dashboardId: string;
  widget: Extract<TDashboardWidget, { widget_type: "kpi" }>;
};

/**
 * Renders a `kpi` widget as a single big number + label. `insight-card.tsx`
 * (`apps/web/core/components/analytics/insight-card.tsx`) doesn't quite fit
 * here - it's shaped around `IAnalyticsResponseFields.count` and has no
 * concept of a percentage suffix (needed for the `completion_rate` metric),
 * so this is a small, dedicated component instead.
 */
export function KpiWidget({ workspaceSlug, dashboardId, widget }: Props) {
  const { t } = useTranslation();
  const { getWidgetData } = useCustomDashboard();

  const { data, error, isLoading, mutate } = useSWR(
    `DASHBOARD_WIDGET_DATA_${widget.id}`,
    () => getWidgetData(workspaceSlug, dashboardId, widget.id) as Promise<TDashboardWidgetKpiData>,
    { revalidateOnFocus: false }
  );

  const isPercentage = widget.config.metric === "completion_rate";

  return (
    <WidgetDataStateWrapper isLoading={isLoading} error={error} onRetry={() => mutate()}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-2">
        <div className="text-32 font-bold text-primary">
          {data?.value ?? 0}
          {isPercentage ? "%" : ""}
        </div>
        <div className="text-13 text-tertiary">
          {t(`workspace_dashboards.widget.kpi.metrics.${widget.config.metric}`)}
        </div>
      </div>
    </WidgetDataStateWrapper>
  );
}
