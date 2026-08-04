/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { DashboardsListRoot } from "@/components/dashboards/list-root";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function WorkspaceDashboardsPage() {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name
    ? t("workspace_dashboards.page_label", { workspace: currentWorkspace?.name })
    : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <DashboardsListRoot />
    </>
  );
}

export default observer(WorkspaceDashboardsPage);
