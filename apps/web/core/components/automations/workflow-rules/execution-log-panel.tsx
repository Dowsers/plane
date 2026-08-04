/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import useSWR from "swr";
// plane imports
import { EPillSize, Pill } from "@plane/propel/pill";
import { Tooltip } from "@plane/propel/tooltip";
import type { TWorkflowExecutionStatus, TWorkflowRule, TWorkflowRuleExecutionLog } from "@plane/types";
import { Button, CustomSelect, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { calculateTimeAgo, renderFormattedDate, renderFormattedPayloadDate, renderFormattedTime } from "@plane/utils";
// components
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
// services
import { WorkflowRuleService } from "@/services/workflow-rule.service";
// local imports
import {
  EXECUTION_STATUS_LABELS,
  EXECUTION_STATUS_OPTIONS,
  EXECUTION_STATUS_PILL_VARIANT,
  SKIP_REASON_LABELS,
} from "./constants";

const workflowRuleService = new WorkflowRuleService();
const PER_PAGE = 20;

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  rule: TWorkflowRule;
};

const skipReasonLabel = (errorMessage: string | null): string => {
  if (!errorMessage) return "";
  return SKIP_REASON_LABELS[errorMessage as keyof typeof SKIP_REASON_LABELS] ?? errorMessage;
};

function ExecutionLogRow({
  log,
  workspaceSlug,
  projectId,
}: {
  log: TWorkflowRuleExecutionLog;
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <tr className="border-b border-subtle-1 align-top">
      <td className="py-2 pr-3">
        <Pill variant={EXECUTION_STATUS_PILL_VARIANT[log.status]} size={EPillSize.SM}>
          {EXECUTION_STATUS_LABELS[log.status]}
        </Pill>
      </td>
      <td className="py-2 pr-3 whitespace-nowrap text-secondary">{log.trigger_event}</td>
      <td className="py-2 pr-3">
        <Link
          href={`/${workspaceSlug}/projects/${projectId}/issues/${log.issue}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-primary hover:underline"
        >
          View work item
        </Link>
      </td>
      <td className="py-2 pr-3 text-secondary">
        {log.status === "SKIPPED" && <span>{skipReasonLabel(log.error_message)}</span>}
        {log.status === "FAILED" && <span className="text-danger-primary">{log.error_message}</span>}
        {log.status === "SUCCESS" && <span>{log.actions_applied.length} action(s) applied</span>}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap text-tertiary">
        <Tooltip tooltipContent={`${renderFormattedDate(log.executed_at)}, ${renderFormattedTime(log.executed_at)}`}>
          <span>{calculateTimeAgo(log.executed_at)}</span>
        </Tooltip>
      </td>
    </tr>
  );
}

/**
 * Paginated execution-log viewer for a single rule - standard cursor
 * pagination (`cursor`/`per_page` query params, see
 * apps/api/plane/utils/paginator.py::BasePaginator), filterable by
 * `status` and a `date_from`/`date_to` range.
 */
export function WorkflowRuleExecutionLogPanel(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, rule } = props;
  const [statusFilter, setStatusFilter] = useState<TWorkflowExecutionStatus | "ALL">("ALL");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const params = useMemo(
    () => ({
      per_page: PER_PAGE,
      cursor,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      date_from: dateRange.from ? renderFormattedPayloadDate(dateRange.from) : undefined,
      date_to: dateRange.to ? renderFormattedPayloadDate(dateRange.to) : undefined,
    }),
    [cursor, statusFilter, dateRange]
  );

  const { data, isLoading } = useSWR(
    isOpen ? ["WORKFLOW_RULE_EXECUTION_LOGS", workspaceSlug, projectId, rule.id, params] : null,
    isOpen ? () => workflowRuleService.executionLogs(workspaceSlug, projectId, rule.id, params) : null
  );

  const applyFilter = (fn: () => void) => {
    setCursor(undefined);
    fn();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-16 font-medium text-primary">Execution history - {rule.name}</h4>
          <button onClick={handleClose} type="button" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CustomSelect
            value={statusFilter}
            label={statusFilter === "ALL" ? "All statuses" : EXECUTION_STATUS_LABELS[statusFilter]}
            onChange={(value: TWorkflowExecutionStatus | "ALL") => applyFilter(() => setStatusFilter(value))}
            input
          >
            <CustomSelect.Option value="ALL">All statuses</CustomSelect.Option>
            {EXECUTION_STATUS_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {option.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          <DateRangeDropdown
            buttonVariant="border-with-text"
            value={dateRange}
            onSelect={(range) => applyFilter(() => setDateRange({ from: range?.from, to: range?.to }))}
            placeholder={{ from: "From date", to: "To date" }}
            isClearable
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-subtle text-left text-tertiary">
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Trigger</th>
                <th className="py-2 pr-3 font-medium">Work item</th>
                <th className="py-2 pr-3 font-medium">Details</th>
                <th className="py-2 pr-3 font-medium">Executed</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((log) => (
                <ExecutionLogRow key={log.id} log={log} workspaceSlug={workspaceSlug} projectId={projectId} />
              ))}
            </tbody>
          </table>
          {isLoading && (
            <Loader className="mt-2 flex flex-col gap-2">
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
            </Loader>
          )}
          {!isLoading && (data?.results.length ?? 0) === 0 && (
            <p className="py-6 text-center text-13 text-tertiary">No execution logs yet.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle pt-3">
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={!data?.prev_page_results || !data?.prev_cursor}
            onClick={() => setCursor(data?.prev_cursor)}
          >
            Previous
          </Button>
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={!data?.next_page_results || !data?.next_cursor}
            onClick={() => setCursor(data?.next_cursor)}
          >
            Next
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
