/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";
// hooks
import { useSyncEngine } from "@/hooks/store/use-sync-engine";

/**
 * Category 12, feature 4 - exigence 5's "Syncing (n)" indicator, placed
 * in the workspace top bar next to the notification bell/inbox icon (per
 * the spec's own suggested placement - see
 * `apps/web/ce/components/navigations/top-navigation-root.tsx`). Only
 * rendered when the workspace's "Mode hors ligne (beta)" rollout toggle
 * is on.
 */
export const SyncIndicator = observer(function SyncIndicator() {
  const { t } = useTranslation();
  const {
    isFeatureEnabled,
    pendingCount,
    failedEntries,
    queueEntries,
    conflicts,
    retryEntry,
    retryAllFailed,
    discardEntry,
  } = useSyncEngine();

  if (!isFeatureEnabled) return null;

  const nonSyncedEntries = queueEntries.filter((entry) => entry.status !== "synced");
  const hasFailed = failedEntries.length > 0;

  return (
    <Popover>
      <Popover.Button>
        <div
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-12 font-medium",
            hasFailed
              ? "bg-danger-subtle text-danger-primary"
              : pendingCount > 0
                ? "bg-layer-1 text-secondary"
                : "text-tertiary"
          )}
        >
          {hasFailed ? (
            <AlertTriangle className="size-3" />
          ) : pendingCount > 0 ? (
            <RefreshCw className="size-3 animate-spin" />
          ) : (
            <Check className="size-3" />
          )}
          {pendingCount > 0 ? t("offline_sync.indicator.syncing", { count: pendingCount }) : null}
        </div>
      </Popover.Button>
      <Popover.Panel side="bottom" align="end">
        <div className="max-h-96 w-80 overflow-y-auto rounded-lg border-[0.5px] border-strong bg-surface-1 p-3 shadow-raised-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-13 font-semibold">{t("offline_sync.indicator.panel_title")}</span>
            {hasFailed && (
              <button
                type="button"
                className="text-12 font-medium text-accent-primary hover:underline"
                onClick={() => retryAllFailed()}
              >
                {t("offline_sync.indicator.retry_all_failed")}
              </button>
            )}
          </div>
          {nonSyncedEntries.length === 0 ? (
            <p className="text-12 text-tertiary">{t("offline_sync.indicator.panel_empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {nonSyncedEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-md border-[0.5px] border-subtle p-2"
                >
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span className="truncate text-12 font-medium">
                      {entry.entityType} - {entry.operation}
                    </span>
                    <span
                      className={cn("text-11", entry.status === "failed" ? "text-danger-primary" : "text-tertiary")}
                    >
                      {entry.status === "failed"
                        ? t("offline_sync.indicator.status_failed")
                        : entry.status === "in_flight"
                          ? t("offline_sync.indicator.status_in_flight")
                          : t("offline_sync.indicator.status_pending")}
                    </span>
                  </div>
                  {entry.status === "failed" && (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="text-12 font-medium text-accent-primary hover:underline"
                        onClick={() => retryEntry(entry.id)}
                      >
                        {t("offline_sync.indicator.retry")}
                      </button>
                      {/* Category 12, feature 4 data-integrity review fix
                          - a failed entry (e.g. one targeting an entity
                          the user has since lost access to) previously
                          had no way to be cleared short of a full
                          workspace/logout purge. */}
                      <button
                        type="button"
                        className="text-12 font-medium text-tertiary hover:underline"
                        onClick={() => discardEntry(entry.id)}
                      >
                        {t("offline_sync.indicator.discard")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {conflicts.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-subtle pt-2">
              {conflicts.slice(0, 5).map((conflict) => (
                <p key={conflict.id} className="text-11 text-warning-primary">
                  {t("offline_sync.conflict.panel_entry", { field: conflict.field })}
                </p>
              ))}
            </div>
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
});
