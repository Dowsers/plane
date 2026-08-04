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
import { Button } from "@plane/propel/button";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { LinkIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TDashboardWidget } from "@plane/types";
import { Loader } from "@plane/ui";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// local imports
import { AddEditWidgetModal } from "./add-edit-widget-modal";
import { DashboardShareModal } from "./share-modal";
import { DashboardWidgetGrid } from "./widget-grid";

const MAX_WIDGETS = 20;

type Props = {
  dashboardId: string;
};

export const DashboardEditorRoot = observer(function DashboardEditorRoot(props: Props) {
  const { dashboardId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { getDashboardById, fetchDashboardDetails } = useCustomDashboard();

  const [addWidgetModal, setAddWidgetModal] = useState(false);
  const [editingWidget, setEditingWidget] = useState<TDashboardWidget | null>(null);
  const [shareModal, setShareModal] = useState(false);

  const { isLoading, error } = useSWR(
    workspaceSlug ? ["DASHBOARD_DETAILS", workspaceSlug, dashboardId] : null,
    workspaceSlug ? () => fetchDashboardDetails(workspaceSlug.toString(), dashboardId) : null,
    { revalidateOnFocus: false }
  );

  const dashboard = getDashboardById(dashboardId);
  const isOwner = dashboard?.owned_by === currentUser?.id;
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canEdit = isOwner || isAdmin;

  if (isLoading && !dashboard) {
    return (
      <div className="flex h-full w-full flex-col gap-4 p-4">
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="40px" />
          <Loader.Item height="200px" />
        </Loader>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="flex h-full w-full items-center justify-center text-13 text-secondary">
        {t("workspace_dashboards.toast.error")}
      </div>
    );
  }

  const maxWidgetsReached = dashboard.widgets.length >= MAX_WIDGETS;

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <div className="flex flex-shrink-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-18 font-medium">{dashboard.name}</h2>
          {dashboard.description && <p className="truncate text-13 text-secondary">{dashboard.description}</p>}
        </div>
        {canEdit ? (
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              prependIcon={<LinkIcon className="size-3.5" />}
              onClick={() => setShareModal(true)}
            >
              {t("workspace_dashboards.share.title")}
            </Button>
            <Tooltip
              disabled={!maxWidgetsReached}
              tooltipContent={t("workspace_dashboards.editor.max_widgets_reached")}
            >
              <span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setAddWidgetModal(true)}
                  disabled={maxWidgetsReached}
                >
                  {t("workspace_dashboards.editor.add_widget")}
                </Button>
              </span>
            </Tooltip>
          </div>
        ) : (
          <span className="flex-shrink-0 text-12 text-secondary">
            {t("workspace_dashboards.editor.read_only_banner")}
          </span>
        )}
      </div>

      {dashboard.widgets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyStateDetailed
            assetKey="dashboard"
            title={t("workspace_dashboards.editor.empty_state.title")}
            description={t("workspace_dashboards.editor.empty_state.description")}
            actions={
              canEdit
                ? [{ label: t("workspace_dashboards.editor.add_widget"), onClick: () => setAddWidgetModal(true) }]
                : []
            }
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DashboardWidgetGrid
            workspaceSlug={workspaceSlug.toString()}
            dashboardId={dashboard.id}
            widgets={dashboard.widgets}
            canEdit={canEdit}
            onEditWidget={(widget) => setEditingWidget(widget)}
          />
        </div>
      )}

      <AddEditWidgetModal
        isOpen={addWidgetModal || !!editingWidget}
        handleClose={() => {
          setAddWidgetModal(false);
          setEditingWidget(null);
        }}
        dashboardId={dashboard.id}
        widget={editingWidget}
      />
      <DashboardShareModal isOpen={shareModal} handleClose={() => setShareModal(false)} dashboard={dashboard} />
    </div>
  );
});
