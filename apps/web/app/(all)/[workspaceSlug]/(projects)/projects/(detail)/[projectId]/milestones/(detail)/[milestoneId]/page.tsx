/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { MilestoneDetailRoot } from "@/components/milestones/detail/root";
// hooks
import { useMilestone } from "@/hooks/store/use-milestone";
import { useProject } from "@/hooks/store/use-project";

function MilestoneDetailPage() {
  const { milestoneId } = useParams();
  const { currentProjectDetails } = useProject();
  const { getMilestoneById } = useMilestone();

  const milestone = milestoneId ? getMilestoneById(milestoneId.toString()) : null;
  const pageTitle =
    currentProjectDetails?.name && milestone?.name ? `${currentProjectDetails.name} - ${milestone.name}` : undefined;

  if (!milestoneId) return null;

  return (
    <>
      <PageHead title={pageTitle} />
      <MilestoneDetailRoot milestoneId={milestoneId.toString()} />
    </>
  );
}

export default observer(MilestoneDetailPage);
