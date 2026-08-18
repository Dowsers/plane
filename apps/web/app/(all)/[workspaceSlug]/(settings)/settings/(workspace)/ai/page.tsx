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
import { AIConfigSettingsRoot } from "@/components/ai-config/root";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { AIWorkspaceSettingsHeader } from "./header";

function AISettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  // derived values - matches the backend's own Admin-only-for-every-verb
  // gating (`WorkspaceAIConfigEndpoint`/`WorkspaceAIConfigTestEndpoint`,
  // apps/api/plane/app/views/workspace_ai_config.py): Member/Guest never
  // see this configuration screen at all.
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("ai.settings.title")}` : undefined;

  if (workspaceUserInfo && !isWorkspaceAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<AIWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-6">
        <SettingsHeading title={t("ai.settings.title")} description={t("ai.settings.description")} />
        <AIConfigSettingsRoot workspaceSlug={workspaceSlug} />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(AISettingsPage);
