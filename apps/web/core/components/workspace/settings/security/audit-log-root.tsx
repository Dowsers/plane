/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { AUDIT_EVENT_TYPE_LABELS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TAuditEventType } from "@plane/types";
import { Loader } from "@plane/ui";
import { renderFormattedDate, renderFormattedPayloadDate, renderFormattedTime } from "@plane/utils";
// components
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import workspaceAuditLogService from "@/services/workspace-audit-log.service";
// local imports
import { AuditLogDetailModal } from "./audit-log-detail-modal";
import { AuditLogEventTypeFilterDropdown } from "./audit-log-event-type-filter";

const PER_PAGE = 25;

type Props = {
  workspaceSlug: string;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3+5 merged - Workspace Settings > Security >
 * Audit log table. Owner-only surface (`WorkspaceAuditLogViewSet`,
 * apps/api/plane/app/views/workspace/audit_log.py - a 403 for any
 * non-Owner is expected if this ever renders for one, but the parent page
 * already gates on `is_owner` before mounting this). Filters: event type
 * (multi), date range, actor, target - all applied server-side via the
 * same `apply_audit_log_filters` the CSV export endpoint also uses, so
 * "Export CSV" always matches what's on screen (exigence 11).
 */
export const WorkspaceSecurityAuditLog = observer(function WorkspaceSecurityAuditLog(props: Props) {
  const { workspaceSlug } = props;
  // state
  const [eventTypes, setEventTypes] = useState<TAuditEventType[]>([]);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [actorId, setActorId] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(`${PER_PAGE}:0:0`);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // store hooks
  const {
    workspace: { workspaceMemberIds },
  } = useMember();

  const filters = useMemo(
    () => ({
      event_type: eventTypes.length > 0 ? eventTypes : undefined,
      date_from: dateRange.from ? renderFormattedPayloadDate(dateRange.from) : undefined,
      date_to: dateRange.to ? renderFormattedPayloadDate(dateRange.to) : undefined,
      actor: actorId ?? undefined,
      target_user: targetUserId ?? undefined,
    }),
    [eventTypes, dateRange, actorId, targetUserId]
  );

  const { data, isLoading } = useSWR(
    ["WORKSPACE_AUDIT_LOGS", workspaceSlug, cursor, filters],
    () => workspaceAuditLogService.list(workspaceSlug, { ...filters, cursor, per_page: PER_PAGE }),
    { revalidateOnFocus: false }
  );

  const applyFilter = (fn: () => void) => {
    setCursor(`${PER_PAGE}:0:0`);
    fn();
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await workspaceAuditLogService.exportCsv(workspaceSlug, filters);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Export started",
        message: "Once the export is ready you will be able to download it from Workspace Settings > Exports.",
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Export failed",
        message: "Something went wrong while starting the export. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <AuditLogEventTypeFilterDropdown value={eventTypes} onChange={(v) => applyFilter(() => setEventTypes(v))} />
        <DateRangeDropdown
          buttonVariant="border-with-text"
          value={dateRange}
          onSelect={(range) => applyFilter(() => setDateRange({ from: range?.from, to: range?.to }))}
          placeholder={{ from: "From date", to: "To date" }}
          isClearable
        />
        <MemberDropdown
          memberIds={workspaceMemberIds ?? []}
          multiple={false}
          value={actorId}
          onChange={(v) => applyFilter(() => setActorId(v))}
          placeholder="Actor"
          buttonVariant="border-with-text"
          showUserDetails
        />
        <MemberDropdown
          memberIds={workspaceMemberIds ?? []}
          multiple={false}
          value={targetUserId}
          onChange={(v) => applyFilter(() => setTargetUserId(v))}
          placeholder="Target"
          buttonVariant="border-with-text"
          showUserDetails
        />
        <Button variant="secondary" size="sm" className="ml-auto" onClick={handleExport} loading={isExporting}>
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-subtle">
        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-subtle bg-layer-1 text-left text-tertiary">
              <th className="px-3 py-2 font-medium">Date / Time</th>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">IP</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data?.results?.map((log) => (
              <tr
                key={log.id}
                className="cursor-pointer border-b border-subtle-1 last:border-0 hover:bg-layer-transparent-hover"
                onClick={() => setSelectedLogId(log.id)}
              >
                <td className="px-3 py-2 whitespace-nowrap text-tertiary">
                  {renderFormattedDate(log.created_at)}, {renderFormattedTime(log.created_at)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-secondary">
                  {AUDIT_EVENT_TYPE_LABELS[log.event_type]}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-secondary">
                  {log.actor?.email ?? log.actor_email_snapshot ?? "System"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-secondary">
                  {log.target_user?.email ?? log.target_email_snapshot ?? (log.target_type || "—")}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-tertiary">{log.ip_address ?? "—"}</td>
                <td className="px-3 py-2 text-right text-accent-primary">Details</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && (
          <Loader className="flex flex-col gap-2 p-3">
            <Loader.Item height="32px" />
            <Loader.Item height="32px" />
            <Loader.Item height="32px" />
          </Loader>
        )}
        {!isLoading && (data?.results?.length ?? 0) === 0 && (
          <EmptyStateCompact
            assetKey="search"
            title="No audit log entries"
            description="No security events match the current filters yet."
            align="center"
            rootClassName="py-16"
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.prev_page_results || !data?.prev_cursor}
          onClick={() => setCursor(data?.prev_cursor)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.next_page_results || !data?.next_cursor}
          onClick={() => setCursor(data?.next_cursor)}
        >
          Next
        </Button>
      </div>

      <AuditLogDetailModal
        workspaceSlug={workspaceSlug}
        auditLogId={selectedLogId}
        onClose={() => setSelectedLogId(null)}
      />
    </div>
  );
});
