/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { DashboardReadOnlyBanner } from "@/components/dashboards/read-only-banner";
import { PublicDashboardWidgetGrid } from "@/components/dashboards/widget-grid";
// hooks
import { useDashboardPublish } from "@/hooks/store/dashboards";

const DashboardPage = observer(function DashboardPage() {
  const params = useParams<{ anchor: string }>();
  const { anchor } = params;
  const dashboard = useDashboardPublish(anchor ?? "");

  // Client-side fetch time of this page load (exigence 13) - fixed for the
  // lifetime of the page since there's no live/real-time widget refresh in
  // this v1 (manual reload only, matching the backend's own no-cache-
  // beyond-a-page-load design).
  const lastRefreshedAt = useMemo(() => new Date(), []);

  if (!anchor || !dashboard) return null;

  return (
    <div className="flex h-full w-full flex-col">
      <DashboardReadOnlyBanner lastRefreshedAt={lastRefreshedAt} />
      <div className="flex-1 overflow-y-auto p-4">
        {dashboard.description && <p className="mb-4 text-13 text-secondary">{dashboard.description}</p>}
        <PublicDashboardWidgetGrid anchor={anchor} widgets={dashboard.widgets} />
      </div>
    </div>
  );
});

export default DashboardPage;
