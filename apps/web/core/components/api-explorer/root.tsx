/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle, Settings as SettingsIcon } from "lucide-react";
// plane imports
import { EUserPermissions } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TApiExplorerEndpoint,
  TApiExplorerHistoryEntry,
  TOpenAPIDocument,
  TWorkspaceAPIExplorerSettings,
} from "@plane/types";
import { LogoSpinner } from "@/components/common/logo-spinner";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { ConfirmMutationModal, type TPendingMutation } from "./confirm-mutation-modal";
import { EndpointBrowser } from "./endpoint-browser";
import { HistoryPanel } from "./history-panel";
import { RateLimitBadge } from "./rate-limit-badge";
import { RequestBuilder } from "./request-builder";
import { ResponseViewer } from "./response-viewer";
import { apiExplorerService } from "./service";
import { SettingsToggle } from "./settings-toggle";
import { TokenPanel } from "./token-panel";
import type { TActiveToken, TExecutePayload, TReplaySeed } from "./types";
import {
  MAX_HISTORY_ENTRIES,
  computeExecuteGate,
  extractRateLimitInfo,
  isMutatingMethod,
  parseOpenAPISchema,
  type TRateLimitInfo,
} from "./utils";

type Props = {
  workspaceSlug: string;
};

/**
 * Root orchestrator for the interactive API Explorer (category 8, feature
 * 6) - see docs/feature-specs/08-api-webhooks-cli.md ("6. Explorateur
 * d'API interactif") in plane-selfhost for the full spec, and this
 * feature's final report for design decisions on every "your call" item
 * (token bootstrap flow, webhook test-send placement, curl-only snippet,
 * shallow JSON tree, etc.).
 *
 * Three-zone layout per the spec's own "Panneau a trois zones": endpoint
 * browser (left), request builder (center), response viewer (right),
 * with a permanent workspace/instance banner, a rate-limit badge, and a
 * session-local, replayable call history below the builder.
 */
export const ApiExplorerRoot = observer(function ApiExplorerRoot({ workspaceSlug }: Props) {
  const { currentWorkspace } = useWorkspace();
  const { getWorkspaceRoleByWorkspaceSlug } = useUserPermissions();

  const role = getWorkspaceRoleByWorkspaceSlug(workspaceSlug);
  const isAdmin = role === EUserPermissions.ADMIN;
  const isMember = role === EUserPermissions.MEMBER;

  // ---- workspace settings (is_enabled / allow_members_execute) ----
  const [settings, setSettings] = useState<TWorkspaceAPIExplorerSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiExplorerService
      .getSettings(workspaceSlug)
      .then((data) => {
        if (!cancelled) setSettings(data);
        return null;
      })
      .catch(() => {
        if (!cancelled) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not load API Explorer settings." });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSettings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  const handleToggleEnabled = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const updated = await apiExplorerService.updateSettings(workspaceSlug, { is_enabled: value });
      setSettings(updated);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not update this setting." });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleToggleAllowMembersExecute = async (value: boolean) => {
    setIsSavingSettings(true);
    try {
      const updated = await apiExplorerService.updateSettings(workspaceSlug, { allow_members_execute: value });
      setSettings(updated);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not update this setting." });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // ---- token ----
  const [activeToken, setActiveToken] = useState<TActiveToken | null>(null);

  // ---- schema ----
  const [schemaDoc, setSchemaDoc] = useState<TOpenAPIDocument>({ paths: {} });
  const [endpoints, setEndpoints] = useState<TApiExplorerEndpoint[]>([]);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<TRateLimitInfo | null>(null);

  useEffect(() => {
    if (!activeToken) {
      setEndpoints([]);
      setSchemaError(null);
      return;
    }
    let cancelled = false;
    setIsLoadingSchema(true);
    setSchemaError(null);
    apiExplorerService
      .getSchema(workspaceSlug, activeToken.value)
      .then((result) => {
        if (cancelled) return;
        const info = extractRateLimitInfo(result.headers);
        if (info) setRateLimitInfo(info);
        if (result.error) {
          setSchemaError(result.error);
          return;
        }
        if (result.status === 404) {
          setSchemaError("The API Explorer is not enabled on this instance (or for this workspace).");
          return;
        }
        if (result.status === 401 || result.status === 403) {
          setSchemaError("This token was rejected (invalid, expired, or insufficient permissions).");
          return;
        }
        if (result.status < 200 || result.status >= 300) {
          setSchemaError(`Could not load the schema (HTTP ${result.status}).`);
          return;
        }
        setSchemaDoc(result.data);
        setEndpoints(parseOpenAPISchema(result.data));
        return null;
      })
      .catch(() => {
        if (!cancelled) setSchemaError("Could not load the schema.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSchema(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeToken?.value, workspaceSlug]);

  // ---- selection / draft / execution ----
  const [selectedEndpoint, setSelectedEndpoint] = useState<TApiExplorerEndpoint | null>(null);
  const [replaySeed, setReplaySeed] = useState<TReplaySeed | null>(null);
  const [lastResult, setLastResult] = useState<TApiExplorerHistoryEntry | null>(null);
  const [history, setHistory] = useState<TApiExplorerHistoryEntry[]>([]);
  const [pendingExecution, setPendingExecution] = useState<TExecutePayload | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleSelectEndpoint = (endpoint: TApiExplorerEndpoint) => {
    setSelectedEndpoint(endpoint);
    setReplaySeed(null);
    setLastResult(null);
  };

  const fireRequest = async (payload: TExecutePayload) => {
    if (!activeToken) return;
    setIsExecuting(true);
    try {
      const parsedBody = payload.bodyText ? JSON.parse(payload.bodyText) : undefined;
      const result = await apiExplorerService.executeRequest(
        activeToken.value,
        payload.method,
        payload.url,
        parsedBody
      );
      const info = extractRateLimitInfo(result.headers);
      if (info) setRateLimitInfo(info);

      const entry: TApiExplorerHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        method: payload.method,
        url: payload.url,
        requestHeaders: { "X-Api-Key": "<redacted>", "X-Plane-Source": "api-explorer" },
        requestBody: payload.bodyText,
        status: result.error ? null : result.status,
        statusText: result.statusText,
        durationMs: result.durationMs,
        responseHeaders: result.headers,
        responseBody: result.data,
        error: result.error ?? null,
        timestamp: Date.now(),
        endpointId: payload.endpointId,
        pathValues: payload.pathValues,
        queryValues: payload.queryValues,
      };
      setLastResult(entry);
      setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExecute = (payload: TExecutePayload) => {
    if (isMutatingMethod(payload.method)) {
      setPendingExecution(payload);
    } else {
      void fireRequest(payload);
    }
  };

  const handleConfirmMutation = async () => {
    if (!pendingExecution) return;
    await fireRequest(pendingExecution);
    setPendingExecution(null);
  };

  const handleReplay = (entry: TApiExplorerHistoryEntry) => {
    const endpoint = endpoints.find((e) => e.id === entry.endpointId);
    if (!endpoint) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Can't replay",
        message: "This endpoint is no longer present in the current schema.",
      });
      return;
    }
    setSelectedEndpoint(endpoint);
    setReplaySeed({
      pathValues: entry.pathValues,
      queryValues: entry.queryValues,
      bodyText: entry.requestBody,
      nonce: Date.now(),
    });
    setLastResult(null);
  };

  const executeGate = useMemo(
    () =>
      selectedEndpoint
        ? computeExecuteGate({
            isAdmin,
            isMember,
            allowMembersExecute: Boolean(settings?.allow_members_execute),
            activeToken,
            method: selectedEndpoint.method,
            rateLimitInfo,
          })
        : { allowed: false, reason: null },
    [selectedEndpoint, isAdmin, isMember, settings?.allow_members_execute, activeToken, rateLimitInfo]
  );

  const pendingMutationForModal: TPendingMutation | null = pendingExecution
    ? { method: pendingExecution.method, url: pendingExecution.url }
    : null;

  if (isLoadingSettings) {
    return (
      <div className="grid h-64 w-full place-items-center">
        <LogoSpinner />
      </div>
    );
  }

  if (!settings) {
    return <p className="text-13 text-tertiary">Could not load API Explorer settings for this workspace.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-md border border-warning-strong bg-warning-subtle p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-warning-primary" />
          <p className="text-13 text-warning-primary">
            You are calling the real API of workspace <strong>{currentWorkspace?.name ?? workspaceSlug}</strong>. Every
            request here affects real data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RateLimitBadge info={rateLimitInfo} />
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="text-tertiary hover:text-primary"
              aria-label="API Explorer settings"
            >
              <SettingsIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsToggle
          settings={settings}
          isAdmin={isAdmin}
          isSaving={isSavingSettings}
          onToggleEnabled={handleToggleEnabled}
          onToggleAllowMembersExecute={handleToggleAllowMembersExecute}
        />
      )}

      {!settings.is_enabled ? (
        <p className="rounded-md border border-subtle p-4 text-13 text-tertiary">
          The API Explorer is currently disabled for this workspace.
          {isAdmin ? " Enable it above to continue." : " Ask a workspace Admin to enable it."}
        </p>
      ) : (
        <>
          <TokenPanel
            workspaceSlug={workspaceSlug}
            isAdmin={isAdmin}
            allowMembersExecute={settings.allow_members_execute}
            activeToken={activeToken}
            onActiveTokenChange={(token) => {
              setActiveToken(token);
              setSelectedEndpoint(null);
              setLastResult(null);
              setHistory([]);
              // A new token has its own, unseen rate-limit quota - the
              // previous token's last-known numbers would be actively
              // misleading if left on screen until the next real call.
              setRateLimitInfo(null);
            }}
          />

          {activeToken && (
            <>
              {isLoadingSchema && (
                <div className="grid h-32 place-items-center">
                  <LogoSpinner />
                </div>
              )}
              {schemaError && <p className="text-13 text-danger-primary">{schemaError}</p>}

              {!isLoadingSchema && !schemaError && endpoints.length > 0 && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_1fr]">
                  <div className="max-h-[600px] min-h-[300px] rounded-md border border-subtle p-2 lg:max-h-[720px]">
                    <EndpointBrowser
                      endpoints={endpoints}
                      selectedEndpointId={selectedEndpoint?.id ?? null}
                      onSelect={handleSelectEndpoint}
                    />
                  </div>
                  <div className="rounded-md border border-subtle p-3">
                    {selectedEndpoint ? (
                      <RequestBuilder
                        key={selectedEndpoint.id}
                        endpoint={selectedEndpoint}
                        doc={schemaDoc}
                        executeGate={executeGate}
                        isExecuting={isExecuting}
                        onExecute={handleExecute}
                        replaySeed={replaySeed}
                        activeTokenValue={activeToken.value}
                      />
                    ) : (
                      <p className="text-13 text-tertiary">Select an endpoint on the left to build a request.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="rounded-md border border-subtle p-3">
                      <ResponseViewer entry={lastResult} />
                    </div>
                    <div className="rounded-md border border-subtle p-2">
                      <h6 className="mb-1 px-1 text-12 font-semibold tracking-wide text-tertiary uppercase">History</h6>
                      <HistoryPanel entries={history} onReplay={handleReplay} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <ConfirmMutationModal
        pending={pendingMutationForModal}
        isSubmitting={isExecuting}
        onCancel={() => setPendingExecution(null)}
        onConfirm={handleConfirmMutation}
      />
    </div>
  );
});
