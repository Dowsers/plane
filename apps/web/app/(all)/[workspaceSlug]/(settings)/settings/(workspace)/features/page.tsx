/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { FeaturesWorkspaceSettingsHeader } from "./header";

function FeaturesPage() {
  const { workspaceSlug } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace, updateWorkspace } = useWorkspace();
  const { t } = useTranslation();

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canPerformWorkspaceMemberActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("initiatives.settings.title")}`
    : undefined;

  const handleToggleInitiatives = async (value: boolean) => {
    if (!workspaceSlug) return;
    try {
      await updateWorkspace(workspaceSlug.toString(), { is_initiatives_enabled: value });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("initiatives.toast.error") });
    }
  };

  if (workspaceUserInfo && !canPerformWorkspaceMemberActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<FeaturesWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className={cn("flex w-full flex-col gap-y-6", { "opacity-60": !canPerformWorkspaceMemberActions })}>
        <SettingsHeading title={t("initiatives.settings.title")} description={t("initiatives.settings.description")} />
        <div className="flex items-center justify-between gap-4 rounded-md border-[0.5px] border-subtle p-4">
          <div className="flex flex-col gap-1">
            <span className="text-14 font-medium">{t("initiatives.label")}</span>
            <span className="text-13 text-secondary">{t("initiatives.settings.description")}</span>
          </div>
          <ToggleSwitch
            value={!!currentWorkspace?.is_initiatives_enabled}
            onChange={(value) => handleToggleInitiatives(value)}
            disabled={!isWorkspaceAdmin}
          />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesPage);
