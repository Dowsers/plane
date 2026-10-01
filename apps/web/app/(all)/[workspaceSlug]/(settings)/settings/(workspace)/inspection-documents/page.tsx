/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { WorkspaceInspectionTemplatesRoot } from "@/components/inspection";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import type { Route } from "./+types/page";
import { InspectionDocumentsWorkspaceSettingsHeader } from "./header";

/**
 * Workspace Settings > "Inspection documents" - the workspace-wide DEFAULT
 * templates every inspection project inherits (ISO/IEC 17020 §4.1/§4.2).
 * The per-project override lives in that project's own "Inspection" tab.
 *
 * Admin-only, matching `WorkspaceInspectionTemplateEndpoint` /
 * `InspectionTemplateVersionEndpoint` (apps/api/plane/app/views/inspection.py),
 * which are `@allow_permission([ROLE.ADMIN], level="WORKSPACE")` for every verb
 * including read - so the nav gate and this page gate are the whole story, with
 * no further inner restriction to mirror.
 */
function InspectionDocumentsSettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { t } = useTranslation();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // derived values
  const canView = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.inspection_documents.title")}`
    : undefined;

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<InspectionDocumentsWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <WorkspaceInspectionTemplatesRoot workspaceSlug={workspaceSlug} />
    </SettingsContentWrapper>
  );
}

export default observer(InspectionDocumentsSettingsPage);
