/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TFlexibleQueryRequest } from "@plane/types";
import { Button, Input, ToggleSwitch } from "@plane/ui";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { FlexibleQueryService } from "@/services/flexible-query.service";

const flexibleQueryService = new FlexibleQueryService();

type Props = {
  workspaceSlug: string;
};

const DEFAULT_QUERY_BODY = JSON.stringify({ entity: "issue", fields: ["id", "name"], limit: 5 }, null, 2);

/**
 * Governed by two independent switches (see `Workspace.is_flexible_query_enabled`'s
 * own comment, apps/api/plane/db/models/workspace.py): the instance-wide
 * `FLEXIBLE_QUERY_ENABLED` env var (not editable from here - instance
 * admin/deployment concern) ANDed with this per-workspace toggle. Read
 * access is open to any active member (the toggle/quota are useful context
 * even for a non-admin integrator), editing the toggle or the quotas is
 * Admin-only - mirrors the backend's own split exactly
 * (`WorkspaceQuerySettingsEndpoint.get` has no role gate, `.patch` is
 * `ROLE.ADMIN`; the toggle itself goes through the generic Workspace PATCH,
 * also Admin-only via `WorkspaceEntityPermission`).
 */
export const FlexibleQuerySettingsRoot = observer(function FlexibleQuerySettingsRoot(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const { currentWorkspace, updateWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [maxDepth, setMaxDepth] = useState<number | null>(null);
  const [maxCost, setMaxCost] = useState<number | null>(null);
  const [timeoutMs, setTimeoutMs] = useState<number | null>(null);
  const [isSavingQuotas, setIsSavingQuotas] = useState(false);
  const [hasLoadedQuotas, setHasLoadedQuotas] = useState(false);

  const [apiToken, setApiToken] = useState("");
  const [queryBody, setQueryBody] = useState(DEFAULT_QUERY_BODY);
  const [isRunningQuery, setIsRunningQuery] = useState(false);
  const [queryResult, setQueryResult] = useState<{ status: number; body: unknown } | null>(null);

  useEffect(() => {
    let cancelled = false;
    flexibleQueryService
      .getSettings(workspaceSlug)
      .then((settings) => {
        if (cancelled) return;
        setMaxDepth(settings.max_depth);
        setMaxCost(settings.max_cost);
        setTimeoutMs(settings.timeout_ms);
        return;
      })
      .catch(() => {
        if (!cancelled) setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("flexible_query.toast.error") });
      })
      .finally(() => {
        if (!cancelled) setHasLoadedQuotas(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  const handleToggleEnabled = async () => {
    if (!currentWorkspace) return;
    setIsTogglingEnabled(true);
    try {
      await updateWorkspace(workspaceSlug, { is_flexible_query_enabled: !currentWorkspace.is_flexible_query_enabled });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("flexible_query.toast.error") });
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const handleSaveQuotas = async () => {
    if (maxDepth === null || maxCost === null || timeoutMs === null) return;
    setIsSavingQuotas(true);
    try {
      const updated = await flexibleQueryService.updateSettings(workspaceSlug, {
        max_depth: maxDepth,
        max_cost: maxCost,
        timeout_ms: timeoutMs,
      });
      setMaxDepth(updated.max_depth);
      setMaxCost(updated.max_cost);
      setTimeoutMs(updated.timeout_ms);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Quotas updated." });
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? t("flexible_query.toast.error");
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSavingQuotas(false);
    }
  };

  const handleRunQuery = async () => {
    if (!apiToken.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Paste one of your API tokens first." });
      return;
    }
    let parsedBody: TFlexibleQueryRequest;
    try {
      parsedBody = JSON.parse(queryBody);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Query body must be valid JSON." });
      return;
    }
    setIsRunningQuery(true);
    setQueryResult(null);
    try {
      const { status, data } = await flexibleQueryService.runQuery(workspaceSlug, apiToken.trim(), parsedBody);
      setQueryResult({ status, body: data });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "The request could not be sent." });
    } finally {
      setIsRunningQuery(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 rounded-md border border-subtle p-4">
        <div>
          <h5 className="text-14 font-medium text-primary">Enable for this workspace</h5>
          <p className="text-13 text-tertiary">
            Also requires the instance-wide flag to be enabled by whoever deployed this instance - this toggle only
            covers this workspace's own opt-in.
          </p>
        </div>
        <ToggleSwitch
          value={Boolean(currentWorkspace?.is_flexible_query_enabled)}
          onChange={handleToggleEnabled}
          disabled={!isAdmin || isTogglingEnabled}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-subtle p-4">
        <h5 className="text-14 font-medium text-primary">Quotas</h5>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">Max nesting depth</span>
            <Input
              type="number"
              min={1}
              value={maxDepth ?? ""}
              onChange={(e) => setMaxDepth(e.target.value ? Number(e.target.value) : null)}
              disabled={!isAdmin || !hasLoadedQuotas}
              inputSize="sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">Max cost</span>
            <Input
              type="number"
              min={1}
              value={maxCost ?? ""}
              onChange={(e) => setMaxCost(e.target.value ? Number(e.target.value) : null)}
              disabled={!isAdmin || !hasLoadedQuotas}
              inputSize="sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">Timeout (ms)</span>
            <Input
              type="number"
              min={1}
              value={timeoutMs ?? ""}
              onChange={(e) => setTimeoutMs(e.target.value ? Number(e.target.value) : null)}
              disabled={!isAdmin || !hasLoadedQuotas}
              inputSize="sm"
            />
          </div>
        </div>
        {isAdmin && (
          <div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveQuotas}
              loading={isSavingQuotas}
              disabled={!hasLoadedQuotas}
            >
              Save
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-subtle p-4">
        <h5 className="text-14 font-medium text-primary">Try it</h5>
        <p className="text-13 text-tertiary">
          Paste one of your own API tokens (Workspace Settings &gt; API Tokens) and a query body to send a real request
          against this workspace - never a mocked preview.
        </p>
        <Input
          placeholder="Your API token"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          inputSize="sm"
        />
        <textarea
          className="font-mono min-h-[140px] w-full rounded-md border border-subtle bg-layer-1 p-2 text-13 text-primary"
          value={queryBody}
          onChange={(e) => setQueryBody(e.target.value)}
          spellCheck={false}
        />
        <div>
          <Button variant="neutral-primary" size="sm" onClick={handleRunQuery} loading={isRunningQuery}>
            Run query
          </Button>
        </div>
        {queryResult && (
          <div className="flex flex-col gap-1">
            <span className="text-12 font-medium text-secondary">HTTP {queryResult.status}</span>
            <pre className="max-h-[320px] overflow-auto rounded-md border border-subtle bg-layer-1 p-2 text-12 text-primary">
              {JSON.stringify(queryResult.body, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
});
