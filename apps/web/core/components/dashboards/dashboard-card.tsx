/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { GlobeIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TDashboard } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
// local imports
import { DashboardQuickActions } from "./quick-actions";

type Props = {
  dashboard: TDashboard;
};

export const DashboardCard = observer(function DashboardCard(props: Props) {
  const { dashboard } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();

  return (
    <div className="group relative flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4 hover:bg-layer-1">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/${workspaceSlug}/dashboards/${dashboard.id}/`}
          className="flex flex-grow items-center gap-2 truncate text-14 font-medium hover:underline"
        >
          <span className="truncate">{dashboard.name}</span>
          {dashboard.is_published && (
            <Tooltip tooltipContent={t("workspace_dashboards.published_badge")}>
              <span className="flex-shrink-0 text-accent-primary">
                <GlobeIcon className="size-3.5" />
              </span>
            </Tooltip>
          )}
        </Link>
        <div className="opacity-0 group-hover:opacity-100">
          <DashboardQuickActions dashboard={dashboard} />
        </div>
      </div>

      {dashboard.description && <p className="line-clamp-2 text-13 text-secondary">{dashboard.description}</p>}

      <div className="flex flex-wrap items-center gap-3 text-11 text-secondary">
        <span className="flex items-center gap-1">
          <LayoutGrid className="size-3" />
          {dashboard.widgets.length}
        </span>
        <span>{renderFormattedDate(dashboard.created_at)}</span>
      </div>
    </div>
  );
});
