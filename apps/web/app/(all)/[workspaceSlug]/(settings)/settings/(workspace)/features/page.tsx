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

  const handleToggleRoadmap = async (value: boolean) => {
    if (!workspaceSlug) return;
    try {
      await updateWorkspace(workspaceSlug.toString(), { is_roadmap_enabled: value });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("initiatives.toast.error") });
    }
  };

  // Category 12, feature 4 - "Mode hors ligne (beta)" progressive rollout
  // toggle for the local-first/offline sync engine. Purely a frontend gate
  // (see `Workspace.is_offline_sync_enabled`'s own field comment) - the
  // sync engine's provider (`SyncEngineProvider`) only boots when this is
  // true for the active workspace.
  const handleToggleOfflineSync = async (value: boolean) => {
    if (!workspaceSlug) return;
    try {
      await updateWorkspace(workspaceSlug.toString(), { is_offline_sync_enabled: value });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: value ? t("offline_sync.toast.enabled") : t("offline_sync.toast.disabled"),
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("offline_sync.toast.error") });
    }
  };

  // docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking
  // and Work Logs", feature 3 "Workflow d'approbation de timesheet",
  // exigence 11) in plane-selfhost - workspace-wide opt-in for the
  // submit/approve/reject state machine, distinct from the per-project
  // `is_time_tracking_enabled` flag which only gates worklog entry itself.
  const handleToggleTimesheetApproval = async (value: boolean) => {
    if (!workspaceSlug) return;
    try {
      await updateWorkspace(workspaceSlug.toString(), { timesheet_approval_enabled: value });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: "Something went wrong while updating timesheet approvals. Please try again.",
      });
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
        <div className="flex items-center justify-between gap-4 rounded-md border-[0.5px] border-subtle p-4">
          <div className="flex flex-col gap-1">
            <span className="text-14 font-medium">{t("roadmap.label")}</span>
            <span className="text-13 text-secondary">{t("roadmap.settings.description")}</span>
          </div>
          <ToggleSwitch
            value={!!currentWorkspace?.is_roadmap_enabled}
            onChange={(value) => handleToggleRoadmap(value)}
            disabled={!isWorkspaceAdmin}
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-md border-[0.5px] border-subtle p-4">
          <div className="flex flex-col gap-1">
            <span className="text-14 font-medium">{t("offline_sync.settings.toggle_label")}</span>
            <span className="text-13 text-secondary">{t("offline_sync.settings.description")}</span>
          </div>
          <ToggleSwitch
            value={!!currentWorkspace?.is_offline_sync_enabled}
            onChange={(value) => handleToggleOfflineSync(value)}
            disabled={!isWorkspaceAdmin}
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-md border-[0.5px] border-subtle p-4">
          <div className="flex flex-col gap-1">
            <span className="text-14 font-medium">{t("timesheets.settings.title")}</span>
            <span className="text-13 text-secondary">{t("timesheets.settings.description")}</span>
          </div>
          <ToggleSwitch
            value={!!currentWorkspace?.timesheet_approval_enabled}
            onChange={(value) => handleToggleTimesheetApproval(value)}
            disabled={!isWorkspaceAdmin}
          />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesPage);
