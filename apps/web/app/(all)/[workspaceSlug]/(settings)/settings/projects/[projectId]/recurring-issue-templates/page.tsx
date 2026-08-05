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
import { RecurringIssueTemplatesRoot } from "@/components/recurring-issue-templates/root";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { RecurringIssueTemplatesProjectSettingsHeader } from "./header";

function RecurringIssueTemplatesSettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails: projectDetails } = useProject();

  // derived values - matches the backend's own READ_ROLES/WRITE_ROLES for
  // this feature (apps/api/plane/app/views/recurring_issue_template/base.py):
  // Guests can view the list, but every mutating action is Admin/Member only.
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    EUserPermissionsLevel.PROJECT
  );
  const canEdit = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);

  const pageTitle = projectDetails?.name ? `${projectDetails?.name} - Recurring work items` : undefined;

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<RecurringIssueTemplatesProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <RecurringIssueTemplatesRoot workspaceSlug={workspaceSlug} projectId={projectId} canEdit={canEdit} />
    </SettingsContentWrapper>
  );
}

export default observer(RecurringIssueTemplatesSettingsPage);
