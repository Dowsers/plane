/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { AUDIT_EVENT_TYPE_LABELS, SCIM_AUDIT_EVENT_TYPES } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { TAuditEventType } from "@plane/types";
import { CustomSelect, Input, Loader } from "@plane/ui";
import { renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { useTranslation } from "@plane/i18n";
// services
import workspaceSCIMService from "@/services/workspace-scim.service";
// local imports
import { AuditLogDetailModal } from "./audit-log-detail-modal";

const PER_PAGE = 25;

type TStatusFilter = "ALL" | "SUCCESS" | "ERROR";

const SUCCESS_EVENT_TYPES: TAuditEventType[] = SCIM_AUDIT_EVENT_TYPES.filter((type) => type !== "SCIM_SYNC_ERROR");
const ERROR_EVENT_TYPES: TAuditEventType[] = ["SCIM_SYNC_ERROR"];

const STATUS_FILTER_LABEL_KEYS: Record<TStatusFilter, string> = {
  ALL: "scim.provisioning_log.status_filter.all",
  SUCCESS: "success",
  ERROR: "error",
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 2 ("SCIM 2.0 natif") - Workspace Settings >
 * Security > SCIM Provisioning > "Provisioning log" sub-panel. Structurally
 * the SAME kind of data as the general audit log (features 3+5's
 * `WorkspaceSecurityAuditLog`, audit-log-root.tsx) - a filtered slice of
 * `WorkspaceAuditLog` - so this reuses that component's table shape and its
 * `AuditLogDetailModal` verbatim (generalized with a `fetchDetail` prop for
 * exactly this reuse) rather than building a parallel table from scratch.
 * Deliberately NOT a copy of every one of that component's filters though:
 * - no actor filter (every SCIM event's actor is the token's own
 *   `created_by`, not a meaningfully varying dimension here);
 * - no CSV export (the backend endpoint - `WorkspaceSCIMProvisioningLogEndpoint`,
 *   apps/api/plane/app/views/workspace/scim_admin.py - never built one,
 *   only the general audit log did, exigence 11 is scoped to that
 *   endpoint specifically);
 * - "status" is a derived 2-way split of `event_type` (`SCIM_SYNC_ERROR` vs.
 *   the other 3), not a real column on `WorkspaceAuditLog` - there is no
 *   separate backend "status" field to filter on;
 * - "search by email" is a CLIENT-SIDE filter over the current page only -
 *   `apply_audit_log_filters` (apps/api/plane/utils/audit_log_filters.py)
 *   has no free-text search param, and reusing the existing `MemberDropdown`
 *   (id-based `target_user` filter) would silently miss failed
 *   `SCIM_SYNC_ERROR` rows whose target never became a real
 *   `WorkspaceMember`. Documented limitation, not a hidden gap.
 */
export const SCIMProvisioningLog = observer(function SCIMProvisioningLog(props: { workspaceSlug: string }) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  // state
  const [statusFilter, setStatusFilter] = useState<TStatusFilter>("ALL");
  const [emailSearch, setEmailSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(`${PER_PAGE}:0:0`);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const eventTypeFilter = useMemo(() => {
    if (statusFilter === "SUCCESS") return SUCCESS_EVENT_TYPES;
    if (statusFilter === "ERROR") return ERROR_EVENT_TYPES;
    return undefined;
  }, [statusFilter]);

  const { data, isLoading } = useSWR(
    ["WORKSPACE_SCIM_PROVISIONING_LOG", workspaceSlug, cursor, eventTypeFilter],
    () =>
      workspaceSCIMService.listProvisioningLog(workspaceSlug, {
        event_type: eventTypeFilter,
        cursor,
        per_page: PER_PAGE,
      }),
    { revalidateOnFocus: false }
  );

  const applyFilter = (fn: () => void) => {
    setCursor(`${PER_PAGE}:0:0`);
    fn();
  };

  const visibleResults = useMemo(() => {
    const results = data?.results ?? [];
    const query = emailSearch.trim().toLowerCase();
    if (!query) return results;
    return results.filter((log) => {
      const email = log.target_user?.email ?? log.target_email_snapshot ?? "";
      return email.toLowerCase().includes(query);
    });
  }, [data?.results, emailSearch]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={statusFilter}
          onChange={(value: TStatusFilter) => applyFilter(() => setStatusFilter(value))}
          label={t(STATUS_FILTER_LABEL_KEYS[statusFilter])}
          buttonClassName="border border-subtle bg-layer-1"
        >
          {(Object.keys(STATUS_FILTER_LABEL_KEYS) as TStatusFilter[]).map((key) => (
            <CustomSelect.Option key={key} value={key}>
              {t(STATUS_FILTER_LABEL_KEYS[key])}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
        <Input
          type="text"
          value={emailSearch}
          onChange={(e) => setEmailSearch(e.target.value)}
          placeholder={t("scim.provisioning_log.search_placeholder")}
          className="w-64"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-subtle">
        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-subtle bg-layer-1 text-left text-tertiary">
              <th className="px-3 py-2 font-medium">{t("audit_log.table.date_time")}</th>
              <th className="px-3 py-2 font-medium">{t("audit_log.table.event")}</th>
              <th className="px-3 py-2 font-medium">{t("audit_log.table.target")}</th>
              <th className="px-3 py-2 font-medium">{t("scim.provisioning_log.status")}</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visibleResults.map((log) => (
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
                  {log.target_user?.email ?? log.target_email_snapshot ?? "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`rounded-xs px-2 py-0.5 text-11 font-medium ${
                      log.event_type === "SCIM_SYNC_ERROR"
                        ? "bg-danger-subtle text-danger-primary"
                        : "bg-success-subtle text-success-primary"
                    }`}
                  >
                    {log.event_type === "SCIM_SYNC_ERROR" ? t("error") : t("success")}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-accent-primary">{t("audit_log.details")}</td>
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
        {!isLoading && visibleResults.length === 0 && (
          <EmptyStateCompact
            assetKey="search"
            title={t("scim.provisioning_log.empty.title")}
            description={t("scim.provisioning_log.empty.description")}
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
          {t("audit_log.pagination.previous")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.next_page_results || !data?.next_cursor}
          onClick={() => setCursor(data?.next_cursor)}
        >
          {t("next")}
        </Button>
      </div>

      <AuditLogDetailModal
        workspaceSlug={workspaceSlug}
        auditLogId={selectedLogId}
        onClose={() => setSelectedLogId(null)}
        fetchDetail={(slug, id) => workspaceSCIMService.getProvisioningLogDetail(slug, id)}
        queryKeyPrefix="WORKSPACE_SCIM_PROVISIONING_LOG_DETAIL"
      />
    </div>
  );
});
