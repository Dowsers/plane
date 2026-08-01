/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRoadmapColorBy } from "@plane/types";
import { getBlockViewDetails } from "@/components/issues/issue-layouts/utils";
import { SIDEBAR_WIDTH } from "@/components/gantt-chart/constants";
import { getRoadmapProjectColor } from "@/components/roadmap/utils";
import { useRoadmap } from "@/hooks/store/use-roadmap";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  projectId: string;
  colorBy: TRoadmapColorBy;
};

export const ProjectGanttBlock = observer(function ProjectGanttBlock(props: Props) {
  const { projectId, colorBy } = props;
  const router = useAppRouter();
  const { workspaceSlug } = useParams();
  const { getRoadmapProjectById } = useRoadmap();
  const project = getRoadmapProjectById(projectId);

  const color = getRoadmapProjectColor(project ?? undefined, colorBy);
  const { message, blockStyle } = getBlockViewDetails(project, color);

  return (
    <Tooltip
      isMobile={usePlatformOS().isMobile}
      tooltipContent={
        <div className="space-y-1">
          <h5>{project?.name}</h5>
          <div>{message}</div>
        </div>
      }
      position="top-start"
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- same pattern as the pre-existing ModuleGanttBlock, the Gantt bar itself is a navigation shortcut, not the primary way to open a project */}
      <div
        className="relative flex h-full w-full cursor-pointer items-center rounded-sm"
        style={blockStyle}
        onClick={() => router.push(`/${workspaceSlug?.toString()}/projects/${project?.id}`)}
      >
        <div className="absolute top-0 left-0 h-full w-full bg-surface-1/50" />
        <div
          className="sticky w-auto truncate overflow-hidden px-2.5 py-1 text-13 text-primary"
          style={{ left: `${SIDEBAR_WIDTH}px` }}
        >
          {project?.name}
        </div>
      </div>
    </Tooltip>
  );
});

export const ProjectGanttSidebarBlock = observer(function ProjectGanttSidebarBlock(props: { projectId: string }) {
  const { projectId } = props;
  const { workspaceSlug } = useParams();
  const { getRoadmapProjectById } = useRoadmap();
  const project = getRoadmapProjectById(projectId);

  return (
    <Link
      className="relative flex h-full w-full items-center gap-2"
      href={`/${workspaceSlug?.toString()}/projects/${project?.id}`}
      draggable={false}
    >
      {project?.logo_props && <Logo logo={project.logo_props} size={16} />}
      <h6 className="flex-grow truncate text-13 font-medium">{project?.name}</h6>
    </Link>
  );
});
