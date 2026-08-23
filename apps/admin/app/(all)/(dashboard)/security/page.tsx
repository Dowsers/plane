/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { InstanceService } from "@plane/services";
import { Button } from "@plane/propel/button";
import { setPromiseToast } from "@plane/propel/toast";
import type { TInstanceConfigurationKeys } from "@plane/types";
import { Input, Loader } from "@plane/ui";
import { renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
// hooks
import { useInstance } from "@/hooks/store";
// types
import type { Route } from "./+types/page";

const instanceService = new InstanceService();
const PER_PAGE = 20;

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * god-mode-only numeric field for `INSTANCE_MAX_SESSION_TIMEOUT_MINUTES`
 * (`apps/api/plane/utils/instance_config_variables/extended.py`), the
 * instance-wide ceiling `WorkspaceSecurityPolicy.session_timeout_minutes`
 * is capped against (`plane.utils.session_activity`). Verified there is no
 * generic config-schema-driven renderer anywhere in apps/admin - every
 * category (AI, workspace, authentication providers...) hand-builds its
 * own form bound to specific `formattedConfig` keys via `useInstance()`
 * (data-fetching IS generic - `fetchInstanceConfigurations`/
 * `updateInstanceConfigurations` - only the UI per key is not), so this
 * follows that exact same pattern (mirrors `WorkspaceManagementPage`'s own
 * `DISABLE_WORKSPACE_CREATION` field) rather than inventing a new one.
 * Lives on this god-mode "Security" page since that's this fork's one
 * existing SECURITY-category god-mode surface, even though the rest of
 * the page is the (feature 3+5) instance audit log.
 */
const SESSION_TIMEOUT_CONFIG_KEY: TInstanceConfigurationKeys = "INSTANCE_MAX_SESSION_TIMEOUT_MINUTES";

const InstanceAuditLogPage = observer(function InstanceAuditLogPage(_props: Route.ComponentProps) {
  // state
  const [cursor, setCursor] = useState<string | undefined>(`${PER_PAGE}:0:0`);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [maxSessionTimeout, setMaxSessionTimeout] = useState("");
  const [hasInitializedMaxSessionTimeout, setHasInitializedMaxSessionTimeout] = useState(false);
  // store
  const { formattedConfig, fetchInstanceConfigurations, updateInstanceConfigurations } = useInstance();

  useSWR("INSTANCE_CONFIGURATIONS", () => fetchInstanceConfigurations());

  // Sync the editable draft from the fetched config exactly once - so a
  // later re-fetch (e.g. after saving) never clobbers what's mid-edit.
  useEffect(() => {
    const fetchedValue = formattedConfig?.[SESSION_TIMEOUT_CONFIG_KEY];
    if (!hasInitializedMaxSessionTimeout && fetchedValue !== undefined) {
      setMaxSessionTimeout(fetchedValue);
      setHasInitializedMaxSessionTimeout(true);
    }
  }, [formattedConfig, hasInitializedMaxSessionTimeout]);

  const { data, isLoading } = useSWR(["INSTANCE_AUDIT_LOGS", cursor], () =>
    instanceService.auditLogs({ cursor, per_page: PER_PAGE })
  );

  const handleSaveMaxSessionTimeout = async () => {
    setIsSubmitting(true);
    const updatePromise = updateInstanceConfigurations({ [SESSION_TIMEOUT_CONFIG_KEY]: maxSessionTimeout });
    setPromiseToast(updatePromise, {
      loading: "Saving configuration",
      success: { title: "Success", message: () => "Configuration saved successfully" },
      error: { title: "Error", message: () => "Failed to save configuration" },
    });
    await updatePromise.catch((err) => console.error(err));
    setIsSubmitting(false);
  };

  return (
    <PageWrapper
      header={{
        title: "Security audit log",
        description: "Instance-level configuration changes, such as OAuth/SSO credential updates in god-mode.",
      }}
    >
      <div className="mb-8 flex flex-col gap-3 border-b border-subtle pb-8">
        <div>
          <div className="text-16 font-medium">Session idle-timeout ceiling</div>
          <div className="text-11 leading-5 font-regular text-tertiary">
            The maximum idle-timeout, in minutes, any workspace Owner may configure for their own workspace. A workspace
            with no timeout of its own, or one above this ceiling, falls back to this value.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={5}
            max={43200}
            value={maxSessionTimeout}
            onChange={(e) => setMaxSessionTimeout(e.target.value)}
            disabled={!formattedConfig}
            inputSize="sm"
            className="w-40"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSaveMaxSessionTimeout}
            disabled={!formattedConfig || isSubmitting}
          >
            Save
          </Button>
        </div>
      </div>
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
