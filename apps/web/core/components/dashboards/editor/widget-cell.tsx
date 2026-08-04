/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDashboardWidget } from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
// local imports
import { ChartWidget } from "./widgets/chart-widget";
import { KpiWidget } from "./widgets/kpi-widget";
import { TableWidget } from "./widgets/table-widget";

type Props = {
  workspaceSlug: string;
  dashboardId: string;
  widget: TDashboardWidget;
  canEdit: boolean;
  onEdit: (widget: TDashboardWidget) => void;
};

export const DashboardWidgetCell = observer(function DashboardWidgetCell(props: Props) {
  const { workspaceSlug, dashboardId, widget, canEdit, onEdit } = props;
  const { t } = useTranslation();
  const { deleteWidget } = useCustomDashboard();

  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteWidget(workspaceSlug, dashboardId, widget.id);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("workspace_dashboards.toast.error") });
    } finally {
      setIsDeleting(false);
      setDeleteModal(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-subtle bg-surface-1 p-3">
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("workspace_dashboards.widget.actions.delete")}
        content={t("workspace_dashboards.widget.actions.delete_confirmation")}
      />
      <div className="mb-2 flex flex-shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {canEdit && (
            <span className="dashboard-widget-drag-handle cursor-grab text-placeholder">
              <GripVertical className="size-3.5" />
            </span>
          )}
          <span className="truncate text-13 font-medium">{widget.title}</span>
        </div>
        {canEdit && (
          <CustomMenu
            customButton={<IconButton variant="tertiary" size="base" icon={MoreHorizontal} />}
            placement="bottom-end"
            closeOnSelect
          >
            <CustomMenu.MenuItem onClick={() => onEdit(widget)} className="flex items-center gap-2">
              <Pencil className="h-3 w-3" />
              {t("edit")}
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem
              onClick={() => setDeleteModal(true)}
              className="flex items-center gap-2 text-danger-primary"
            >
              <Trash2 className="h-3 w-3" />
              {t("delete")}
            </CustomMenu.MenuItem>
          </CustomMenu>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {widget.widget_type === "chart" && (
          <ChartWidget workspaceSlug={workspaceSlug} dashboardId={dashboardId} widget={widget} />
        )}
        {widget.widget_type === "kpi" && (
          <KpiWidget workspaceSlug={workspaceSlug} dashboardId={dashboardId} widget={widget} />
        )}
        {widget.widget_type === "table" && (
          <TableWidget workspaceSlug={workspaceSlug} dashboardId={dashboardId} widget={widget} />
        )}
      </div>
    </div>
  );
});
