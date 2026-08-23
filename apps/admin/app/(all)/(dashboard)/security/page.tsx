/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { InstanceService } from "@plane/services";
import { Button } from "@plane/propel/button";
import { Loader } from "@plane/ui";
import { renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
// types
import type { Route } from "./+types/page";

const instanceService = new InstanceService();
const PER_PAGE = 20;

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3+5 merged, exigence 10 - god-mode-only view
 * of the instance-scoped audit log (`InstanceAuditLogEndpoint`,
 * apps/api/plane/license/api/views/audit_log.py). Deliberately minimal
 * relative to the workspace-level Security > Audit log tab in the main
 * app - today this endpoint only ever surfaces `OAUTH_CONFIG_UPDATED`
 * events (`workspace=null`), so there is no event-type filter here, and
 * `old_value`/`new_value` are never populated for this event (secrets are
 * never logged - see `InstanceConfigurationEndpoint.patch`) - only
 * `metadata.keys_updated` (which config keys changed) is shown.
 */
const InstanceAuditLogPage = observer(function InstanceAuditLogPage(_props: Route.ComponentProps) {
  // state
  const [cursor, setCursor] = useState<string | undefined>(`${PER_PAGE}:0:0`);

  const { data, isLoading } = useSWR(["INSTANCE_AUDIT_LOGS", cursor], () =>
    instanceService.auditLogs({ cursor, per_page: PER_PAGE })
  );

  return (
    <PageWrapper
      header={{
        title: "Security audit log",
        description: "Instance-level configuration changes, such as OAuth/SSO credential updates in god-mode.",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-subtle text-left text-tertiary">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Event</th>
              <th className="py-2 pr-3 font-medium">Actor</th>
              <th className="py-2 pr-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {data?.results?.map((log) => (
              <tr key={log.id} className="border-b border-subtle-1 align-top">
                <td className="py-2 pr-3 whitespace-nowrap text-tertiary">
                  {renderFormattedDate(log.created_at)}, {renderFormattedTime(log.created_at)}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-secondary">{log.event_type}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-secondary">
                  {log.actor?.email ?? log.actor_email_snapshot ?? "System"}
                </td>
                <td className="py-2 pr-3 text-secondary">
                  {Array.isArray(log.metadata?.keys_updated)
                    ? `Keys updated: ${(log.metadata.keys_updated as string[]).join(", ")}`
                    : "—"}
                </td>
              </tr>
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
        {!isLoading && (data?.results?.length ?? 0) === 0 && (
          <p className="py-6 text-center text-13 text-tertiary">No instance-level configuration changes yet.</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle pt-3">
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
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Security Audit Log - God Mode" }];

export default InstanceAuditLogPage;
