/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CheckIcon } from "@plane/propel/icons";
import type { ICycle } from "@plane/types";
import { CircularProgressIndicator } from "@plane/ui";
import { calculateCycleProgress } from "@plane/utils";
// components
import { ListItem } from "@/components/core/list";
// hooks
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
  cycle: ICycle;
};

export const WorkspaceActiveCycleListItem = observer(function WorkspaceActiveCycleListItem(props: Props) {
  const { workspaceSlug, cycle } = props;
  const parentRef = useRef(null);
  const { getProjectById } = useProject();

  const project = getProjectById(cycle.project_id);
  const progress = calculateCycleProgress(cycle);

  return (
    <ListItem
      parentRef={parentRef}
      title={cycle.name}
      itemLink={`/${workspaceSlug}/projects/${cycle.project_id}/cycles/${cycle.id}`}
      prependTitleElement={
        <CircularProgressIndicator size={30} percentage={progress} strokeWidth={3}>
          {progress === 100 ? (
            <CheckIcon className="h-3 w-3 stroke-2" />
          ) : (
            <span className="text-9 text-primary">{`${progress}%`}</span>
          )}
        </CircularProgressIndicator>
      }
      appendTitleElement={
        project ? (
          <span className="flex flex-shrink-0 items-center gap-1.5 text-12 text-tertiary">
            <Logo logo={project.logo_props} size={14} />
            <span className="truncate">{project.name}</span>
          </span>
        ) : undefined
      }
      actionableItems={
        <span className="text-12 whitespace-nowrap text-tertiary">
          {cycle.completed_issues + cycle.cancelled_issues}/{cycle.total_issues} work items closed
        </span>
      }
    />
  );
});
