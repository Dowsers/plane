/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import useSWR from "swr";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
import { getDate } from "@plane/utils";
// components
import { useTimeLineType } from "@/components/gantt-chart/contexts";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import { GanttDependencyLine } from "@/components/gantt-chart/dependency/dependency-line";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useGanttDependencyLinesToggle } from "@/hooks/use-gantt-dependency-lines-toggle";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
// services
import { GanttDependencyService } from "@/services/gantt-dependency.service";

const ganttDependencyService = new GanttDependencyService();

type Props = {
  blockIds: string[];
  itemsContainerWidth: number;
};

// Read-only dependency-line overlay for issue-based Gantt views (Project
// Issues/Cycle/Module-scoped/Project View), built fresh rather than
// reusing the existing (paid, drag-to-create) EE dependency scaffolding -
// see docs/feature-specs/03-projects-roadmaps-initiatives.md ("Lignes de
// dependance Gantt") in plane-selfhost.
export const GanttDependencyLinesOverlay = observer(function GanttDependencyLinesOverlay(props: Props) {
  const { blockIds, itemsContainerWidth } = props;
  const { workspaceSlug, projectId } = useParams();
  const timelineType = useTimeLineType();
  const { isEnabled } = useGanttDependencyLinesToggle();
  const { getBlockById } = useTimeLineChartStore();
  const { relation } = useIssueDetail();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const isIssueGantt = timelineType === GANTT_TIMELINE_TYPE.ISSUE;
  // Freshly-copied array, not a shared reference - safe to sort in place,
  // only used to build a stable SWR cache key.
  // eslint-disable-next-line unicorn/no-array-sort
  const sortedIds = [...blockIds].sort().join(",");

  const { data: dependencies } = useSWR(
    isEnabled && isIssueGantt && workspaceSlug && projectId && blockIds.length > 0
      ? ["GANTT_DEPENDENCIES", workspaceSlug, projectId, sortedIds]
      : null,
    () => ganttDependencyService.list(workspaceSlug!.toString(), projectId!.toString(), blockIds),
    { revalidateOnFocus: false }
  );

  if (!isEnabled || !isIssueGantt || !dependencies?.length) return null;

  return (
    <svg
      className="absolute top-0 left-0"
      width={itemsContainerWidth}
      height={blockIds.length * BLOCK_HEIGHT}
      style={{ pointerEvents: "none" }}
    >
      <defs>
        <marker
          id="gantt-dependency-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-color-tertiary)" />
        </marker>
      </defs>
      {dependencies.map((dependency) => {
        const key = `${dependency.blocking_issue_id}-${dependency.blocked_issue_id}`;
        const blockedIndex = blockIds.indexOf(dependency.blocked_issue_id);
        const blockingIndex = blockIds.indexOf(dependency.blocking_issue_id);
        if (blockedIndex === -1 || blockingIndex === -1) return null;

        const blockedBlock = getBlockById(dependency.blocked_issue_id);
        const blockingBlock = getBlockById(dependency.blocking_issue_id);
        if (!blockedBlock?.position || !blockingBlock?.position) return null;

        const blockingDate = getDate(blockingBlock.target_date);
        const blockedDate = getDate(blockedBlock.start_date);
        const isConflict = !!blockingDate && !!blockedDate && blockingDate > blockedDate;

        return (
          <GanttDependencyLine
            key={key}
            blockingLabel={blockingBlock.name}
            blockedLabel={blockedBlock.name}
            x1={blockingBlock.position.marginLeft + blockingBlock.position.width}
            y1={blockingIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2}
            x2={blockedBlock.position.marginLeft}
            y2={blockedIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2}
            isConflict={isConflict}
            isHovered={hoveredKey === key}
            onHover={(hovered) => setHoveredKey(hovered ? key : null)}
            onRemove={() =>
              relation.removeRelation(
                workspaceSlug!.toString(),
                projectId!.toString(),
                dependency.blocked_issue_id,
                "blocked_by",
                dependency.blocking_issue_id
              )
            }
          />
        );
      })}
    </svg>
  );
});
