/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EPillSize, Pill } from "@plane/propel/pill";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSLAReportParams } from "@plane/types";
import { Button, CustomSelect, Loader } from "@plane/ui";
import { renderFormattedDate, renderFormattedPayloadDate, renderFormattedTime } from "@plane/utils";
// components
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
// services
import { SLAPolicyService } from "@/services/sla-policy.service";
// local imports
import { SLA_STATUS_LABELS, SLA_STATUS_OPTIONS, SLA_STATUS_PILL_VARIANT, SLA_TYPE_LABELS } from "./constants";

const slaPolicyService = new SLAPolicyService();

const POLICIES_KEY = (workspaceSlug: string) => `SLA_POLICIES_${workspaceSlug}`;

type Props = {
  workspaceSlug: string;
};

const formatDateTime = (value: string | null): string => {
  if (!value) return "—";
  return `${renderFormattedDate(value)}, ${renderFormattedTime(value)}`;
};

/**
 * SLA compliance report - filters (project/policy/assignee/date range), a
 * summary stat row (the 6 `IssueSLA.STATUS_CHOICES` counts), and a
 * scrollable results table (server-capped at 500 rows, see
 * `MAX_JSON_DETAIL_ROWS` in apps/api/plane/app/views/sla/report.py) with a
 * CSV export. No chart here, deliberately - 6 fixed status buckets read
 * more clearly as plain labeled counts than as a chart, and this report's
 * own JSON payload doesn't provide a time series to plot anyway (only a
 * point-in-time snapshot over the filtered set).
 */
export function ComplianceReportRoot(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [isExporting, setIsExporting] = useState(false);

  const { data: policies } = useSWR(POLICIES_KEY(workspaceSlug), () => slaPolicyService.list(workspaceSlug));

  const params: TSLAReportParams = useMemo(
    () => ({
      project_id: projectId ?? undefined,
      policy_id: policyId ?? undefined,
      assignee_id: assigneeId ?? undefined,
      date_from: dateRange.from ? renderFormattedPayloadDate(dateRange.from) : undefined,
      date_to: dateRange.to ? renderFormattedPayloadDate(dateRange.to) : undefined,
    }),
    [projectId, policyId, assigneeId, dateRange]
  );

  const { data: report, isLoading } = useSWR(["SLA_REPORT", workspaceSlug, params], () =>
    slaPolicyService.getReport(workspaceSlug, params)
  );

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const blob = await slaPolicyService.getReportCSVBlob(workspaceSlug, params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sla-compliance-report.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.errors.default.title"),
        message: t("sla_policies.report.export_error"),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => {
    setProjectId(null);
    setPolicyId(null);
    setAssigneeId(null);
    setDateRange({ from: undefined, to: undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ProjectDropdown
          multiple={false}
          value={projectId}
          onChange={(val) => setProjectId(val)}
          buttonVariant="border-with-text"
          placeholder={t("sla_policies.scope.all_projects")}
        />
        <CustomSelect
          value={policyId ?? "ALL"}
          label={
            policyId
              ? (policies?.find((policy) => policy.id === policyId)?.name ?? t("sla_policies.report.policy"))
              : t("sla_policies.report.all_policies")
          }
          onChange={(value: string) => setPolicyId(value === "ALL" ? null : value)}
          input
        >
          <CustomSelect.Option value="ALL">{t("sla_policies.report.all_policies")}</CustomSelect.Option>
          {policies?.map((policy) => (
            <CustomSelect.Option key={policy.id} value={policy.id}>
              {policy.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
        <MemberDropdown
          multiple={false}
          value={assigneeId}
          onChange={(val) => setAssigneeId(val)}
          buttonVariant="border-with-text"
          placeholder={t("sla_policies.report.all_assignees")}
        />
        <DateRangeDropdown
          buttonVariant="border-with-text"
          value={dateRange}
          onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
          placeholder={{ from: t("sla_policies.report.from_date"), to: t("sla_policies.report.to_date") }}
          isClearable
        />
        <Button variant="neutral-primary" size="sm" onClick={clearFilters}>
          {t("sla_policies.report.clear_filters")}
        </Button>
        <Button
          variant="accent-primary"
          size="sm"
          prependIcon={<Download className="h-3.5 w-3.5" />}
          onClick={handleExportCSV}
          loading={isExporting}
          className="ml-auto"
        >
          {t("sla_policies.report.export_csv")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SLA_STATUS_OPTIONS.map((option) => (
          <div key={option.value} className="flex items-center gap-1.5 rounded-md border border-subtle px-2.5 py-1.5">
            <Pill variant={SLA_STATUS_PILL_VARIANT[option.value]} size={EPillSize.SM}>
              {SLA_STATUS_LABELS[option.value]}
            </Pill>
            <span className="text-13 font-medium text-primary">{report?.summary[option.value] ?? 0}</span>
          </div>
        ))}
        <div className="ml-auto text-12 text-tertiary">
          {t("sla_policies.report.total")}: {report?.total ?? 0}
        </div>
      </div>

      {report?.results_truncated && (
        <p className="text-11 text-tertiary">
          {t("sla_policies.report.truncated_notice", { shown: report.results.length, total: report.total })}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-subtle">
        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-subtle text-left text-tertiary">
              <th className="px-3 py-2 font-medium">{t("sla_policies.report.column_issue")}</th>
              <th className="px-3 py-2 font-medium">{t("common.project")}</th>
              <th className="px-3 py-2 font-medium">{t("sla_policies.report.policy")}</th>
              <th className="px-3 py-2 font-medium">{t("sla_policies.report.column_type")}</th>
              <th className="px-3 py-2 font-medium">{t("sla_policies.report.column_status")}</th>
              <th className="px-3 py-2 font-medium">{t("sla_policies.report.column_due_at")}</th>
              <th className="px-3 py-2 font-medium">{t("sla_policies.report.column_met_at")}</th>
              <th className="px-3 py-2 font-medium">{t("sla_policies.report.column_breached_at")}</th>
            </tr>
          </thead>
          <tbody>
            {report?.results.map((row) => (
              <tr key={row.id} className="border-b border-subtle-1 align-top">
                <td className="px-3 py-2">
                  <span className="font-medium text-primary">{row.issue_identifier ?? "—"}</span>
                  <p className="truncate text-tertiary">{row.issue_name}</p>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-secondary">{row.project_name ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-secondary">{row.sla_policy_name ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-secondary">{SLA_TYPE_LABELS[row.sla_type]}</td>
                <td className="px-3 py-2">
                  <Pill variant={SLA_STATUS_PILL_VARIANT[row.status]} size={EPillSize.SM}>
                    {SLA_STATUS_LABELS[row.status]}
                  </Pill>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-tertiary">{formatDateTime(row.due_at)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-tertiary">{formatDateTime(row.met_at)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-tertiary">{formatDateTime(row.breached_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && (
          <Loader className="flex flex-col gap-2 p-3">
            <Loader.Item height="32px" />
            <Loader.Item height="32px" />
          </Loader>
        )}
        {!isLoading && (report?.results.length ?? 0) === 0 && (
          <p className="py-6 text-center text-13 text-tertiary">{t("sla_policies.report.empty_state")}</p>
        )}
      </div>
    </div>
  );
}
