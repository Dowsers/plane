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
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { PermissionBundlesRoot } from "@/components/workspace/settings/rbac/permission-bundles-root";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { PermissionBundlesWorkspaceSettingsHeader } from "./header";

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - Workspace Settings > Permission Bundles:
 * an independent library of reusable permission bundles, separate from
 * the Roles tab under Members (exigence 2's own "un bundle... peut etre
 * attache a plusieurs roles simultanement"). Nav-level gate mirrors
 * `security`/`ai`/`sla-policies` (Admin visibility) - real enforcement is
 * the backend's own 403 on every RBAC endpoint for anyone lacking
 * `workspace.manage_roles` (which the system Admin role's own baseline
 * grants unconditionally, not just the real Owner).
 */
function PermissionBundlesSettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  // derived values
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("permission_bundles.settings.title")}`
    : undefined;

  if (workspaceUserInfo && !isWorkspaceAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<PermissionBundlesWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-6">
        <SettingsHeading
          title={t("permission_bundles.settings.title")}
          description={t("permission_bundles.settings.description")}
        />
        <PermissionBundlesRoot workspaceSlug={workspaceSlug} />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(PermissionBundlesSettingsPage);
