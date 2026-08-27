/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TWorklogReport } from "@plane/types";
import { Loader } from "@plane/ui";
// components
import { formatWorklogDuration } from "@/plane-web/components/issues/worklog/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  report: TWorklogReport | undefined;
  isLoading: boolean;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 2 "Timesheets historiques et rapports agrégés",
 * exigence 2/9) in plane-selfhost - grouped-by-project or grouped-by-member
 * results table with a total row, fed by
 * Workspace/Project/MyWorklogReportEndpoint's shared `{ group_by, results,
 * total_duration, total_entries }` shape. Plain `<table>`, matching the
 * style already used by ComplianceReportRoot
 * (apps/web/core/components/sla-policies/compliance-report-root.tsx) rather
 * than the tanstack-table-based `DataTable` (no grouping/totals support
 * built into that one).
 */
export const TimesheetReportTable = observer(function TimesheetReportTable(props: Props) {
  const { report, isLoading } = props;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { getUserDetails } = useMember();

  const groupLabel = report?.group_by === "member" ? t("members") : t("projects");

  return (
    <div className="overflow-x-auto rounded-md border border-subtle">
      <table className="w-full text-13">
        <thead>
          <tr className="border-b border-subtle text-left text-tertiary">
            <th className="px-3 py-2 font-medium">{groupLabel}</th>
            <th className="px-3 py-2 font-medium">Entries</th>
            <th className="px-3 py-2 font-medium">Total time</th>
          </tr>
        </thead>
        <tbody>
          {report?.results.map((row) => {
            const key = row.project_id ?? row.member_id ?? "unknown";
            const label =
              report.group_by === "member"
                ? (getUserDetails(row.member_id ?? "")?.display_name ?? "—")
                : (getProjectById(row.project_id ?? "")?.name ?? "—");
            return (
              <tr key={key} className="border-b border-subtle-1">
                <td className="px-3 py-2 font-medium text-primary">{label}</td>
                <td className="px-3 py-2 text-secondary">{row.entry_count}</td>
                <td className="px-3 py-2 text-secondary">{formatWorklogDuration(row.total_duration)}</td>
              </tr>
            );
          })}
        </tbody>
        {report && report.results.length > 0 && (
          <tfoot>
            <tr className="border-t border-subtle bg-layer-1 font-medium text-primary">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2">{report.total_entries}</td>
              <td className="px-3 py-2">{formatWorklogDuration(report.total_duration)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {isLoading && (
        <Loader className="flex flex-col gap-2 p-3">
          <Loader.Item height="32px" />
          <Loader.Item height="32px" />
        </Loader>
      )}
      {!isLoading && (report?.results.length ?? 0) === 0 && (
        <p className="py-6 text-center text-13 text-tertiary">No worklog entries for the selected filters.</p>
      )}
    </div>
  );
});
