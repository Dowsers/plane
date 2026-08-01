/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import type { TRoadmapColorBy } from "@plane/types";
import { ContentWrapper, Loader } from "@plane/ui";
import useSWR from "swr";
// components
import { RoadmapColorBySelect } from "@/components/roadmap/color-by-select";
import { ProjectsGanttChartView } from "@/components/roadmap/gantt-chart/root";
// hooks
import { useRoadmap } from "@/hooks/store/use-roadmap";

export const RoadmapRoot = observer(function RoadmapRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getWorkspaceProjectIds, fetchRoadmapProjects } = useRoadmap();
  const { storedValue: colorBy, setValue: setColorBy } = useLocalStorage<TRoadmapColorBy>(
    "roadmap_color_by",
    "priority"
  );

  const { isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_ROADMAP_PROJECTS", workspaceSlug] : null,
    workspaceSlug ? () => fetchRoadmapProjects(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const projectIds = workspaceSlug ? getWorkspaceProjectIds(workspaceSlug.toString()) : null;

  if (isLoading && !projectIds) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (!projectIds || projectIds.length === 0) {
    return (
      <ContentWrapper className="items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <h3 className="text-16 font-medium">{t("roadmap.empty_state.title")}</h3>
          <p className="max-w-md text-13 text-secondary">{t("roadmap.empty_state.description")}</p>
        </div>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <div className="flex flex-shrink-0 items-center justify-end pb-4">
        <RoadmapColorBySelect value={colorBy ?? "priority"} onChange={setColorBy} />
      </div>
      <div className="size-full overflow-hidden">
        <ProjectsGanttChartView projectIds={projectIds} colorBy={colorBy ?? "priority"} />
      </div>
    </ContentWrapper>
  );
});
