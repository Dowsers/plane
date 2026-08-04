/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { Button, ContentWrapper, Loader } from "@plane/ui";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateDashboardModal } from "./create-update-modal";
import { DashboardCard } from "./dashboard-card";

export const DashboardsListRoot = observer(function DashboardsListRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { dashboardIds, getDashboardById, fetchDashboards } = useCustomDashboard();

  const [createModal, setCreateModal] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_DASHBOARDS", workspaceSlug] : null,
    workspaceSlug ? () => fetchDashboards(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  if (isLoading && !dashboardIds) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (!dashboardIds || dashboardIds.length === 0) {
    return (
      <ContentWrapper className="items-center justify-center">
        <CreateUpdateDashboardModal isOpen={createModal} handleClose={() => setCreateModal(false)} dashboard={null} />
        <EmptyStateDetailed
          assetKey="dashboard"
          title={t("workspace_dashboards.empty_state.title")}
          description={t("workspace_dashboards.empty_state.description")}
          actions={[
            {
              label: t("workspace_dashboards.empty_state.cta_primary"),
              onClick: () => setCreateModal(true),
              disabled: !canCreate,
            },
          ]}
        />
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <CreateUpdateDashboardModal isOpen={createModal} handleClose={() => setCreateModal(false)} dashboard={null} />
      <div className="flex items-center justify-end pb-4">
        <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
          {t("workspace_dashboards.create_dashboard")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {dashboardIds.map((dashboardId) => {
          const dashboard = getDashboardById(dashboardId);
          if (!dashboard) return null;
          return <DashboardCard key={dashboardId} dashboard={dashboard} />;
        })}
      </div>
    </ContentWrapper>
  );
});
