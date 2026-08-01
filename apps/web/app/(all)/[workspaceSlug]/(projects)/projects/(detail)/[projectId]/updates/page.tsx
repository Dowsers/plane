/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { ProjectUpdatesListRoot } from "@/components/project-updates/root";
// hooks
import { useProject } from "@/hooks/store/use-project";

function ProjectUpdatesPage() {
  const { currentProjectDetails } = useProject();
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - Updates` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <ProjectUpdatesListRoot />
    </>
  );
}

export default observer(ProjectUpdatesPage);
