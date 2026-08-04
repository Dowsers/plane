/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { DashboardEditorRoot } from "@/components/dashboards/editor/editor-root";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";

function DashboardDetailPage() {
  const { dashboardId } = useParams();
  const { getDashboardById } = useCustomDashboard();

  const dashboard = dashboardId ? getDashboardById(dashboardId.toString()) : undefined;

  if (!dashboardId) return null;

  return (
    <>
      <PageHead title={dashboard?.name} />
      <DashboardEditorRoot dashboardId={dashboardId.toString()} />
    </>
  );
}

export default observer(DashboardDetailPage);
