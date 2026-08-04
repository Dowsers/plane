/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RefreshCw } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { Loader } from "@plane/ui";

type Props = {
  isLoading: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  children: React.ReactNode;
};

/** Shared loading/error/empty chrome for every widget-data renderer (chart,
 * kpi, table) on the authenticated dashboard editor - keeps the three
 * widget bodies focused on their own rendering logic only. */
export function WidgetDataStateWrapper(props: Props) {
  const { isLoading, error, isEmpty, onRetry, children } = props;
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Loader className="flex h-full w-full flex-col gap-2 p-2">
        <Loader.Item height="100%" width="100%" />
      </Loader>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-13 text-secondary">
        <span>{t("workspace_dashboards.widget.data.error")}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 text-accent-primary hover:underline"
          >
            <RefreshCw className="size-3" />
            {t("workspace_dashboards.widget.data.refresh")}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyStateCompact
          assetKey="unknown"
          assetClassName="size-16"
          title={t("workspace_dashboards.widget.data.empty")}
        />
      </div>
    );
  }

  return <>{children}</>;
}
