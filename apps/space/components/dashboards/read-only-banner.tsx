/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { GlobeIcon } from "@plane/propel/icons";
import { useTranslation } from "@plane/i18n";

type Props = {
  /** Client-side fetch time of the current page load (exigence 13) - no
   * live/real-time refresh in this v1, only a manual page reload, so this
   * timestamp is set once and doesn't tick. */
  lastRefreshedAt: Date;
};

export function DashboardReadOnlyBanner(props: Props) {
  const { lastRefreshedAt } = props;
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2 border-b border-subtle bg-surface-1 px-5 py-2 text-12 text-secondary">
      <span className="flex items-center gap-1.5">
        <GlobeIcon className="size-3.5" />
        {t("workspace_dashboards.public.read_only_banner")}
      </span>
      <span>
        {t("workspace_dashboards.public.last_refreshed")}: {lastRefreshedAt.toLocaleTimeString()}
      </span>
    </div>
  );
}
