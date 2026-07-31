/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { MilestonesListRoot } from "@/components/milestones/root";
// hooks
import { useProject } from "@/hooks/store/use-project";

function ProjectMilestonesPage() {
  const { currentProjectDetails } = useProject();
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - Milestones` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <MilestonesListRoot />
    </>
  );
}

export default observer(ProjectMilestonesPage);
