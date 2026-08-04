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
import { SitesDashboardService } from "@plane/services";
import type { TDashboardWidgetTableData, TDashboardWidgetTableRow, TPublicDashboardWidget } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
// local imports
import { PublicWidgetDataState } from "../widget-data-state";

type Props = {
  anchor: string;
  widget: Extract<TPublicDashboardWidget, { widget_type: "table" }>;
};

const PER_PAGE = 10;

const dashboardService = new SitesDashboardService();

/** Public-viewer counterpart of `apps/web/core/components/dashboards/
 * editor/widgets/table-widget.tsx` - same compact, cursor-paginated list,
 * built on the same `@plane/propel/table` primitives, fetching through
 * `SitesDashboardService` (public/anonymous, no membership check) instead
 * of the authenticated `CustomDashboardService`. */
export function PublicTableWidget({ anchor, widget }: Props) {
  const { t } = useTranslation();

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<TDashboardWidgetTableRow[]>([]);

  useEffect(() => {
    setCursor(undefined);
    setRows([]);
  }, [widget.id]);

  const { data, error, isLoading } = useSWR(
    `PUBLIC_DASHBOARD_WIDGET_DATA_${anchor}_${widget.id}_${cursor ?? "first"}`,
    () =>
      dashboardService.retrieveWidgetData(anchor, widget.id, {
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
    <PublicWidgetDataState
      isLoading={isLoading && rows.length === 0}
      error={error}
      isEmpty={!isLoading && !error && rows.length === 0}
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
    </PublicWidgetDataState>
  );
}
