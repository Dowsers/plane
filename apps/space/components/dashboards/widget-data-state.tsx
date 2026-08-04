/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { LogoSpinner } from "@/components/common/logo-spinner";

type Props = {
  isLoading: boolean;
  error?: { status?: number } | null;
  isEmpty?: boolean;
  children: React.ReactNode;
};

/**
 * Shared loading/error/empty chrome for the three public widget-data
 * renderers (chart, kpi, table) - keeps the widget-type-specific bodies
 * focused on their own rendering only. The public widget-data endpoint is
 * rate-limited (60/min per anchor+IP, see `DashboardWidgetPublicDataThrottle`
 * on the backend) - a 429 here is handled as a distinct, friendly "try
 * again shortly" state rather than the generic error message, with no
 * retry/backoff logic (a simple state is enough per the feature's own
 * scope for this).
 */
export function PublicWidgetDataState(props: Props) {
  const { isLoading, error, isEmpty, children } = props;
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LogoSpinner />
      </div>
    );
  }

  if (error?.status === 429) {
    return (
      <div className="flex h-full w-full items-center justify-center px-2 text-center text-13 text-secondary">
        {t("workspace_dashboards.public.rate_limited")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center px-2 text-center text-13 text-secondary">
        {t("workspace_dashboards.widget.data.error")}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex h-full w-full items-center justify-center px-2 text-center text-13 text-placeholder">
        {t("workspace_dashboards.widget.data.empty")}
      </div>
    );
  }

  return <>{children}</>;
}
