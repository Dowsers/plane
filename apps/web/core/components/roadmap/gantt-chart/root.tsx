/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
import type { IBlockUpdateData, IBlockUpdateDependencyData, TRoadmapColorBy } from "@plane/types";
import { GanttChartRoot } from "@/components/gantt-chart";
import { TimeLineTypeContext } from "@/components/gantt-chart/contexts";
import { ProjectGanttBlock } from "@/components/roadmap/gantt-chart/blocks";
import { ProjectsGanttSidebar } from "@/components/roadmap/gantt-chart/sidebar";
import { useProject } from "@/hooks/store/use-project";
import { useRoadmap } from "@/hooks/store/use-roadmap";

type Props = {
  projectIds: string[];
  colorBy: TRoadmapColorBy;
};

export const ProjectsGanttChartView = observer(function ProjectsGanttChartView(props: Props) {
  const { projectIds, colorBy } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { updateProject } = useProject();
  const { applyProjectDatesUpdate, getRoadmapProjectById } = useRoadmap();

  // Dragging a project's dates issues the same PATCH .../projects/<id>/ the
  // backend already restricts to project/workspace admins - gating drag here
  // only avoids a round-trip that would 403 for non-admins, see
  // docs/feature-specs/03-projects-roadmaps-initiatives.md ("Roadmap/
  // Timeline cross-projet") in plane-selfhost.
  const isBlockEditable = (blockId: string) => getRoadmapProjectById(blockId)?.member_role === 20;

  const handleProjectUpdate = async (project: { id: string }, data: IBlockUpdateData) => {
    if (!workspaceSlug || !project) return;
    const payload: Partial<{ start_date: string; target_date: string }> = {};
    if (data.start_date) payload.start_date = data.start_date;
    if (data.target_date) payload.target_date = data.target_date;
    await updateProject(workspaceSlug.toString(), project.id, payload);
    applyProjectDatesUpdate(project.id, payload);
  };

  const updateBlockDates = async (blockUpdates: IBlockUpdateDependencyData[]) => {
    const blockUpdate = blockUpdates[0];
    if (!blockUpdate || !workspaceSlug) return;
    const payload: Partial<{ start_date: string; target_date: string }> = {};
    if (blockUpdate.start_date) payload.start_date = blockUpdate.start_date;
    if (blockUpdate.target_date) payload.target_date = blockUpdate.target_date;
    await updateProject(workspaceSlug.toString(), blockUpdate.id, payload);
    applyProjectDatesUpdate(blockUpdate.id, payload);
  };

  return (
    <TimeLineTypeContext.Provider value={GANTT_TIMELINE_TYPE.PROJECT}>
      <GanttChartRoot
        title={t("roadmap.label")}
        loaderTitle={t("projects")}
        blockIds={projectIds}
        sidebarToRender={(sidebarProps) => <ProjectsGanttSidebar {...sidebarProps} />}
        blockUpdateHandler={(block, payload) => handleProjectUpdate(block, payload)}
        blockToRender={(data: { id: string }) => <ProjectGanttBlock projectId={data.id} colorBy={colorBy} />}
        enableBlockLeftResize={isBlockEditable}
        enableBlockRightResize={isBlockEditable}
        enableBlockMove={isBlockEditable}
        updateBlockDates={updateBlockDates}
        showAllBlocks
      />
    </TimeLineTypeContext.Provider>
  );
});
