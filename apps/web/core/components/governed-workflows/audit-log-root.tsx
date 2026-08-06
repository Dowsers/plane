/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
// plane imports
import { EPillSize, Pill } from "@plane/propel/pill";
import { Tooltip } from "@plane/propel/tooltip";
import type { TWorkflowTransitionAuditLog, TWorkflowTransitionAuditLogOutcome } from "@plane/types";
import { Button, CustomSelect, Loader } from "@plane/ui";
import { calculateTimeAgo, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { WorkflowTransitionService } from "@/services/workflow-transition.service";
// local imports
import { AUDIT_LOG_OUTCOME_LABELS, AUDIT_LOG_OUTCOME_OPTIONS, AUDIT_LOG_OUTCOME_PILL_VARIANT } from "./constants";

const workflowTransitionService = new WorkflowTransitionService();
const PER_PAGE = 20;

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const AuditLogRow = observer(function AuditLogRow({
  log,
  workspaceSlug,
  projectId,
}: {
  log: TWorkflowTransitionAuditLog;
  workspaceSlug: string;
  projectId: string;
}) {
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();
  const fromState = log.from_state ? getStateById(log.from_state) : undefined;
  const toState = log.to_state ? getStateById(log.to_state) : undefined;
  const actor = log.actor ? getUserDetails(log.actor) : undefined;

  return (
    <tr className="border-b border-subtle-1 align-top">
      <td className="py-2 pr-3">
        <Pill variant={AUDIT_LOG_OUTCOME_PILL_VARIANT[log.outcome]} size={EPillSize.SM}>
          {AUDIT_LOG_OUTCOME_LABELS[log.outcome]}
        </Pill>
      </td>
      <td className="py-2 pr-3 whitespace-nowrap text-secondary">
        {fromState?.name ?? "Creation"} → {toState?.name ?? "—"}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap text-secondary">{actor?.display_name ?? "—"}</td>
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
      <td className="py-2 pr-3 text-secondary">{log.outcome === "DENIED" && log.denial_reason}</td>
      <td className="py-2 pr-3 whitespace-nowrap text-tertiary">
        <Tooltip tooltipContent={`${renderFormattedDate(log.created_at)}, ${renderFormattedTime(log.created_at)}`}>
          <span>{calculateTimeAgo(log.created_at)}</span>
        </Tooltip>
      </td>
    </tr>
  );
});

/**
 * "Audit log" tab - every evaluated transition attempt (allowed, denied,
 * pending approval), exigence 12/13 of
 * docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
 * multi-etats avec approbations") in plane-selfhost. Structurally mirrors
 * the sibling `WorkflowRuleExecutionLogPanel` (cursor pagination, an
 * outcome/status filter, a deep link to the work item) but as a full tab
 * rather than a per-rule modal, since `WorkflowTransitionAuditLog` is
 * project-wide, not scoped to a single transition (a denied attempt may not
 * even have matched any transition - see that model's own docstring on why
 * `transition` is nullable).
 */
export const WorkflowTransitionAuditLogRoot = observer(function WorkflowTransitionAuditLogRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { fetchProjectStates, getProjectStateIds } = useProjectState();
  const [outcomeFilter, setOutcomeFilter] = useState<TWorkflowTransitionAuditLogOutcome | "ALL">("ALL");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // States are needed to render human-readable from/to state names - see
  // `WorkflowTransitionListRoot`'s identical fetch for why this isn't
  // assumed to already be loaded by the time this tab is opened.
  useSWR(
    getProjectStateIds(projectId)?.length ? null : ["GOVERNED_WORKFLOWS_PROJECT_STATES", workspaceSlug, projectId],
    () => fetchProjectStates(workspaceSlug, projectId),
    { revalidateOnFocus: false }
  );

  const params = useMemo(
    () => ({
      per_page: PER_PAGE,
      cursor,
      outcome: outcomeFilter === "ALL" ? undefined : outcomeFilter,
    }),
    [cursor, outcomeFilter]
  );

  const { data, isLoading } = useSWR(["WORKFLOW_TRANSITION_AUDIT_LOGS", workspaceSlug, projectId, params], () =>
    workflowTransitionService.auditLogs(workspaceSlug, projectId, params)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={outcomeFilter}
          label={outcomeFilter === "ALL" ? "All outcomes" : AUDIT_LOG_OUTCOME_LABELS[outcomeFilter]}
          onChange={(value: TWorkflowTransitionAuditLogOutcome | "ALL") => {
            setCursor(undefined);
            setOutcomeFilter(value);
          }}
          input
        >
          <CustomSelect.Option value="ALL">All outcomes</CustomSelect.Option>
          {AUDIT_LOG_OUTCOME_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.value} value={option.value}>
              {option.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-subtle text-left text-tertiary">
              <th className="py-2 pr-3 font-medium">Outcome</th>
              <th className="py-2 pr-3 font-medium">Transition</th>
              <th className="py-2 pr-3 font-medium">Actor</th>
              <th className="py-2 pr-3 font-medium">Work item</th>
              <th className="py-2 pr-3 font-medium">Reason</th>
              <th className="py-2 pr-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {data?.results.map((log) => (
              <AuditLogRow key={log.id} log={log} workspaceSlug={workspaceSlug} projectId={projectId} />
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
          <p className="py-6 text-center text-13 text-tertiary">No workflow transition activity yet.</p>
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
  );
});
