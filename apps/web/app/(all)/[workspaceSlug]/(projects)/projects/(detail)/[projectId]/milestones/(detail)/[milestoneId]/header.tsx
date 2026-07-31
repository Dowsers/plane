/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Flag } from "lucide-react";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useMilestone } from "@/hooks/store/use-milestone";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const MilestoneDetailHeader = observer(function MilestoneDetailHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId, milestoneId } = useParams();
  const { currentProjectDetails } = useProject();
  const { getMilestoneById } = useMilestone();

  const milestone = milestoneId ? getMilestoneById(milestoneId.toString()) : null;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Milestones"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/milestones/`}
                icon={<Flag className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {milestone && <Breadcrumbs.Item component={<BreadcrumbLink label={milestone.name} />} isLast />}
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
