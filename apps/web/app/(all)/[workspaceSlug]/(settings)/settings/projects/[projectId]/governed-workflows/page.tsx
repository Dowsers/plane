/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { GovernedWorkflowsRoot } from "@/components/governed-workflows/root";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { GovernedWorkflowsProjectSettingsHeader } from "./header";

function GovernedWorkflowsSettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails: projectDetails } = useProject();

  // derived values - matches the backend's own Admin-only gating for every
  // verb, including read (apps/api/plane/app/views/workflow_transition/base.py's
  // `WorkflowTransitionViewSet`/`WorkflowTransitionAuditLogEndpoint`).
  const canView = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  const pageTitle = projectDetails?.name ? `${projectDetails?.name} - Workflows` : undefined;

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<GovernedWorkflowsProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <GovernedWorkflowsRoot workspaceSlug={workspaceSlug} projectId={projectId} />
    </SettingsContentWrapper>
  );
}

export default observer(GovernedWorkflowsSettingsPage);
