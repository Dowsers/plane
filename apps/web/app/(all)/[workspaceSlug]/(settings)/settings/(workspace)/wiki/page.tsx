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
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsControlItem } from "@/components/settings/control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { WikiWorkspaceSettingsHeader } from "./header";

/**
 * Category 10, feature 4 ("Wiki workspace en GA") exigence 4 - the
 * `wiki_root_creation_role` control ("Qui peut creer au niveau racine du
 * Wiki"). Follows the exact same "readable by Admin+Member, editable
 * Admin-only" split already established by the `api`/`api-explorer`
 * workspace settings pages.
 */
function WikiWorkspaceSettingsPage() {
  const { workspaceSlug } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace, updateWorkspace } = useWorkspace();
  const { t } = useTranslation();

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canPerformWorkspaceMemberActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("wiki.settings.title")}` : undefined;

  const rootCreationRole = currentWorkspace?.wiki_root_creation_role ?? "MEMBER";

  const handleChangeRootCreationRole = async (value: "ADMIN" | "MEMBER") => {
    if (!workspaceSlug) return;
    try {
      await updateWorkspace(workspaceSlug.toString(), { wiki_root_creation_role: value });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: "Wiki settings updated." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: "Something went wrong. Please try again." });
    }
  };

  if (workspaceUserInfo && !canPerformWorkspaceMemberActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<WikiWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className={cn("flex w-full flex-col gap-y-6", { "opacity-60": !canPerformWorkspaceMemberActions })}>
        <SettingsHeading title={t("wiki.settings.title")} description={t("wiki.settings.description")} />
        <SettingsControlItem
          title={t("wiki.settings.root_creation_role_label")}
          description="Sub-folders and pages created inside an existing folder are not affected by this setting."
          control={
            <CustomSelect
              value={rootCreationRole}
              label={
                rootCreationRole === "ADMIN"
                  ? t("wiki.settings.root_creation_role_admin")
                  : t("wiki.settings.root_creation_role_member")
              }
              onChange={(val: "ADMIN" | "MEMBER") => handleChangeRootCreationRole(val)}
              disabled={!isWorkspaceAdmin}
              input
            >
              <CustomSelect.Option value="MEMBER">{t("wiki.settings.root_creation_role_member")}</CustomSelect.Option>
              <CustomSelect.Option value="ADMIN">{t("wiki.settings.root_creation_role_admin")}</CustomSelect.Option>
            </CustomSelect>
          }
        />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(WikiWorkspaceSettingsPage);
