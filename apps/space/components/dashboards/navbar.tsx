/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { GridLayoutIcon } from "@plane/propel/icons";
// store
import type { DashboardPublishStore } from "@/store/dashboards/dashboard-publish.store";

type Props = {
  dashboard: DashboardPublishStore;
};

/**
 * Minimal navbar for the public dashboard viewer - mirrors
 * `IssuesNavbarRoot` (`apps/space/components/issues/navbar/root.tsx`)'s
 * structure (project/entity icon + name, left-aligned), but without any of
 * that navbar's theme/layout-selection controls - a read-only dashboard has
 * no per-viewer options to toggle.
 */
export const DashboardNavbar = observer(function DashboardNavbar(props: Props) {
  const { dashboard } = props;

  return (
    <div className="relative flex w-full items-center justify-between gap-4 px-5">
      <div className="flex shrink-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-sm uppercase">
          <GridLayoutIcon className="size-4" />
        </span>
        <div className="line-clamp-1 max-w-[300px] overflow-hidden text-16 font-medium">{dashboard.name}</div>
      </div>
    </div>
  );
});
