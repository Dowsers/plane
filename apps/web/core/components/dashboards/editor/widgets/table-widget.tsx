/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PriorityIcon } from "@plane/propel/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import type { TDashboardWidget, TDashboardWidgetTableData, TDashboardWidgetTableRow } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
// local imports
import { WidgetDataStateWrapper } from "./widget-data-state-wrapper";

type Props = {
  workspaceSlug: string;
  dashboardId: string;
  widget: Extract<TDashboardWidget, { widget_type: "table" }>;
};

const PER_PAGE = 10;

/**
 * Renders a `table` widget as a compact, cursor-paginated list. The
 * legacy `insight-table/` components (`apps/web/core/components/analytics/
 * insight-table/`) are built around `@tanstack/react-table` and a
 * fixed `AnalyticsTableDataMap`/`ColumnDef` shape keyed to the legacy
 * single-project analytics tab - a full-page search/sort/export table,
 * which doesn't fit a small dashboard grid cell showing a handful of rows.
 * This reuses their underlying `@plane/propel/table` primitives
 * (`Table`/`TableHeader`/`TableRow`/`TableCell`) directly, without the
 * tanstack table/search/export machinery on top.
 */
export function TableWidget({ workspaceSlug, dashboardId, widget }: Props) {
  const { t } = useTranslation();
  const { getWidgetData } = useCustomDashboard();

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<TDashboardWidgetTableRow[]>([]);

  useEffect(() => {
    // reset pagination whenever the underlying widget changes
    setCursor(undefined);
    setRows([]);
  }, [widget.id]);

  const { data, error, isLoading, mutate } = useSWR(
    `DASHBOARD_WIDGET_DATA_${widget.id}_${cursor ?? "first"}`,
    () =>
      getWidgetData(workspaceSlug, dashboardId, widget.id, {
        cursor: cursor ?? `${PER_PAGE}:0:0`,
        per_page: PER_PAGE,
      }) as Promise<TDashboardWidgetTableData>,
    {
      revalidateOnFocus: false,
      onSuccess: (response) => {
        setRows((previous) => (cursor ? [...previous, ...response.results] : response.results));
      },
    }
  );

  return (
    <WidgetDataStateWrapper
      isLoading={isLoading && rows.length === 0}
      error={error}
      isEmpty={!isLoading && !error && rows.length === 0}
      onRetry={() => mutate()}
    >
      <div className="flex h-full w-full flex-col gap-2 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("workspace_dashboards.widget.table.columns.name")}</TableHead>
              <TableHead>{t("workspace_dashboards.widget.table.columns.project")}</TableHead>
              <TableHead>{t("workspace_dashboards.widget.table.columns.state")}</TableHead>
              <TableHead>{t("workspace_dashboards.widget.table.columns.priority")}</TableHead>
              <TableHead>{t("workspace_dashboards.widget.table.columns.due_date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[220px] truncate" title={row.name}>
                  {row.project_detail?.identifier}-{row.sequence_id} {row.name}
                </TableCell>
                <TableCell>{row.project_detail?.name}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: row.state_detail?.color }}
                    />
                    {row.state_detail?.name}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1">
                    <PriorityIcon priority={row.priority} className="size-3" />
                    {row.priority}
                  </span>
                </TableCell>
                <TableCell>{row.target_date ? renderFormattedDate(row.target_date) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data?.next_page_results && (
          <button
            type="button"
            className="self-center text-12 text-accent-primary hover:underline"
            onClick={() => data.next_cursor && setCursor(data.next_cursor)}
          >
            {t("workspace_dashboards.widget.table.load_more")}
          </button>
        )}
      </div>
    </WidgetDataStateWrapper>
  );
}
