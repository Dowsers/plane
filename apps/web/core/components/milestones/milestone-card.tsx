/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { isPast } from "date-fns";
// plane imports
import { useTranslation } from "@plane/i18n";
import { LinearProgressIndicator } from "@plane/ui";
import { getDate, renderFormattedDate } from "@plane/utils";
import type { IMilestone } from "@plane/types";
// local imports
import { MilestoneQuickActions } from "./quick-actions";

type Props = {
  milestone: IMilestone;
};

export const MilestoneCard = observer(function MilestoneCard(props: Props) {
  const { milestone } = props;
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();

  const targetDate = getDate(milestone.target_date);
  const isOverdue = !!targetDate && isPast(targetDate) && milestone.completion_percentage !== 100;

  return (
    <div className="group relative flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4 hover:bg-layer-1">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/${workspaceSlug}/projects/${projectId}/milestones/${milestone.id}/`}
          className="flex-grow truncate text-14 font-medium hover:underline"
        >
          {milestone.name}
        </Link>
        <div className="opacity-0 group-hover:opacity-100">
          <MilestoneQuickActions milestone={milestone} />
        </div>
      </div>

      {milestone.description && <p className="line-clamp-2 text-13 text-secondary">{milestone.description}</p>}

      <div className="flex flex-wrap items-center gap-3 text-11 text-secondary">
        <span>
          {t("milestones.label")}: {milestone.total_issues}
        </span>
        {milestone.target_date && (
          <span className={isOverdue ? "font-medium text-danger-primary" : undefined}>
            {isOverdue ? `${t("milestones.overdue")} — ` : ""}
            {t("milestones.target_date")}: {renderFormattedDate(milestone.target_date)}
          </span>
        )}
      </div>

      {milestone.total_issues === 0 ? (
        <p className="text-11 text-placeholder italic">{t("milestones.no_issues_completed")}</p>
      ) : (
        <LinearProgressIndicator
          size="sm"
          data={[
            { id: "completed", name: t("common.done"), value: milestone.completed_issues, color: "#16A34A" },
            {
              id: "remaining",
              name: t("common.pending"),
              value: milestone.total_issues - milestone.completed_issues - milestone.cancelled_issues,
              color: "#A3A3A3",
            },
            { id: "cancelled", name: t("common.cancelled"), value: milestone.cancelled_issues, color: "#DC2626" },
          ]}
        />
      )}
    </div>
  );
});
