/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPublicDashboardWidget } from "@plane/types";
// local imports
import { PublicDashboardWidgetCell } from "./widget-cell";

type Props = {
  anchor: string;
  widgets: TPublicDashboardWidget[];
};

const GRID_COLS = 12;
const ROW_HEIGHT_PX = 56;
const GAP_PX = 12;

/**
 * Static (read-only, non-interactive) widget grid for the public dashboard
 * viewer. Deliberately does NOT use `react-grid-layout` (that's an
 * `apps/web`-only dependency, added there for the authenticated editor's
 * drag-and-drop/resize - see `pnpm-workspace.yaml`'s `catalog:` block and
 * `apps/web/package.json`) - the public viewer only ever needs to lay
 * widgets out at their already-stored `position.x/y/w/h`, never move them,
 * so a plain CSS Grid is enough and avoids bloating this public-facing
 * bundle with a library it would never interact with.
 */
export function PublicDashboardWidgetGrid(props: Props) {
  const { anchor, widgets } = props;

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW_HEIGHT_PX}px`,
        gap: `${GAP_PX}px`,
      }}
    >
      {widgets.map((widget) => (
        <div
          key={widget.id}
          className="min-w-0"
          style={{
            gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
            gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
          }}
        >
          <PublicDashboardWidgetCell anchor={anchor} widget={widget} />
        </div>
      ))}
    </div>
  );
}
