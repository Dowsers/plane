/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { GridLayoutIcon } from "@plane/propel/icons";
// plane imports
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
import { useAppRouter } from "@/hooks/use-app-router";

export const DashboardDetailHeader = observer(function DashboardDetailHeader() {
  const router = useAppRouter();
  const { t } = useTranslation();
  const { workspaceSlug, dashboardId } = useParams();
  const { getDashboardById } = useCustomDashboard();

  const dashboard = dashboardId ? getDashboardById(dashboardId.toString()) : undefined;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back}>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t("sidebar.dashboards")}
                href={`/${workspaceSlug}/dashboards/`}
                icon={<GridLayoutIcon className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {dashboard && <Breadcrumbs.Item component={<BreadcrumbLink label={dashboard.name} />} isLast />}
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
