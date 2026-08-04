/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPublicDashboardWidget } from "@plane/types";
// local imports
import { PublicChartWidget } from "./widgets/chart-widget";
import { PublicKpiWidget } from "./widgets/kpi-widget";
import { PublicTableWidget } from "./widgets/table-widget";

type Props = {
  anchor: string;
  widget: TPublicDashboardWidget;
};

/** Static (no drag/resize/menu) chrome + widget-type dispatch - the public
 * viewer's counterpart of `apps/web/core/components/dashboards/editor/
 * widget-cell.tsx`, minus every owner/admin-only affordance (drag handle,
 * edit/delete menu). */
export function PublicDashboardWidgetCell(props: Props) {
  const { anchor, widget } = props;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-subtle bg-surface-1 p-3">
      <div className="mb-2 flex flex-shrink-0 items-center gap-1.5">
        <span className="truncate text-13 font-medium">{widget.title}</span>
      </div>
      <div className="min-h-0 flex-1">
        {widget.widget_type === "chart" && <PublicChartWidget anchor={anchor} widget={widget} />}
        {widget.widget_type === "kpi" && <PublicKpiWidget anchor={anchor} widget={widget} />}
        {widget.widget_type === "table" && <PublicTableWidget anchor={anchor} widget={widget} />}
      </div>
    </div>
  );
}
