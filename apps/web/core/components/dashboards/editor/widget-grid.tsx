/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import ReactGridLayout, { useContainerWidth } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
// eslint-disable-next-line import/no-unassigned-import -- required side-effect CSS import for the grid/drag/resize styles
import "react-grid-layout/css/styles.css";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDashboardWidget, TDashboardWidgetReorderItem } from "@plane/types";
import { useTranslation } from "@plane/i18n";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
// local imports
import { DashboardWidgetCell } from "./widget-cell";

type Props = {
  workspaceSlug: string;
  dashboardId: string;
  widgets: TDashboardWidget[];
  canEdit: boolean;
  onEditWidget: (widget: TDashboardWidget) => void;
};

const GRID_COLS = 12;
const ROW_HEIGHT = 56;
const SAVE_DEBOUNCE_MS = 500;

function widgetsToLayout(widgets: TDashboardWidget[]): Layout {
  return widgets.map((widget) => ({
    i: widget.id,
    x: widget.position.x,
    y: widget.position.y,
    w: widget.position.w,
    h: widget.position.h,
    minW: 2,
    minH: 2,
  }));
}

/**
 * Drag-and-drop/resize widget grid for the dashboard editor, built on
 * `react-grid-layout` (added as a new dependency for this feature - see
 * `pnpm-workspace.yaml`'s `catalog:` block). Each widget's `position`
 * (`x`/`y`/`w`/`h`) is used directly as the layout item shape (react-grid-
 * layout's own item shape is `{i,x,y,w,h}` - `widget.id` maps to `i`).
 *
 * Draggable/resizable only when `canEdit` is true (owner/admin) - a Guest
 * or non-owner Member gets the exact same grid with `dragConfig`/
 * `resizeConfig` disabled, i.e. a static, non-interactive layout, rather
 * than a separate read-only implementation.
 *
 * Saves are debounced and only fire on `onDragStop`/`onResizeStop` (never
 * on every intermediate `onLayoutChange` during a drag) - a full request
 * per pixel of drag would be needlessly chatty for what is, at most, a
 * once-per-arrangement action.
 */
export const DashboardWidgetGrid = observer(function DashboardWidgetGrid(props: Props) {
  const { workspaceSlug, dashboardId, widgets, canEdit, onEditWidget } = props;
  const { t } = useTranslation();
  const { reorderWidgets } = useCustomDashboard();
  const { width, containerRef, mounted } = useContainerWidth();

  const [localLayout, setLocalLayout] = useState<Layout>(() => widgetsToLayout(widgets));
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalLayout(widgetsToLayout(widgets));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets]);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    },
    []
  );

  const persistLayout = async (layout: Layout) => {
    const items: TDashboardWidgetReorderItem[] = [];
    layout.forEach((item) => {
      const widget = widgets.find((w) => w.id === item.i);
      if (!widget) return;
      const position = { x: item.x, y: item.y, w: item.w, h: item.h };
      const hasChanged =
        widget.position.x !== position.x ||
        widget.position.y !== position.y ||
        widget.position.w !== position.w ||
        widget.position.h !== position.h;
      if (hasChanged) items.push({ id: item.i, position });
    });
    if (items.length === 0) return;

    try {
      await reorderWidgets(workspaceSlug, dashboardId, { widgets: items });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("workspace_dashboards.toast.error") });
    }
  };

  const scheduleSave = (layout: Layout) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void persistLayout(layout);
    }, SAVE_DEBOUNCE_MS);
  };

  return (
    // `containerRef` is typed `RefObject<HTMLDivElement | null>` by
    // react-grid-layout; cast needed for this repo's pinned React 18 JSX
    // ref typings.
    <div ref={containerRef as RefObject<HTMLDivElement>} className="h-full w-full">
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={localLayout}
          gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: [12, 12] }}
          dragConfig={{ enabled: canEdit, handle: ".dashboard-widget-drag-handle" }}
          resizeConfig={{ enabled: canEdit }}
          autoSize
          onLayoutChange={(layout) => setLocalLayout(layout)}
          onDragStop={(layout) => scheduleSave(layout)}
          onResizeStop={(layout) => scheduleSave(layout)}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <DashboardWidgetCell
                workspaceSlug={workspaceSlug}
                dashboardId={dashboardId}
                widget={widget}
                canEdit={canEdit}
                onEdit={onEditWidget}
              />
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
});
