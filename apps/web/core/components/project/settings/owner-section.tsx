/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Crown } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserProjectRoles } from "@plane/types";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 5, exigence 8/9/10 - "Project Owner" section in
 * Project Settings > General. Assign/revoke is restricted server-side to
 * the workspace Owner or a workspace Admin (`ProjectOwnerEndpoint`,
 * apps/api/plane/app/views/project/owner.py) - NOT a plain project Admin -
 * so this checks workspace-level permissions, not the project-level
 * `isAdmin` the rest of this settings page's control section uses.
 */
export const ProjectOwnerSection = observer(function ProjectOwnerSection(props: Props) {
  const { workspaceSlug, projectId } = props;
  // state
  const [pendingOwnerId, setPendingOwnerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { allowPermissions, workspaceInfoBySlug } = useUserPermissions();
  const {
    project: { getProjectMemberIds, getProjectMemberDetails, assignProjectOwner, revokeProjectOwner },
  } = useMember();

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);
  const isWorkspaceOwner = Boolean(workspaceInfoBySlug(workspaceSlug)?.is_owner);
  const canManageProjectOwner = isWorkspaceAdmin || isWorkspaceOwner;

  const projectMemberIds = getProjectMemberIds(projectId, false) ?? [];
  const eligibleAdminIds = projectMemberIds.filter(
    (memberId) => getProjectMemberDetails(memberId, projectId)?.role === EUserProjectRoles.ADMIN
  );
  const currentOwnerId =
    projectMemberIds.find((memberId) => getProjectMemberDetails(memberId, projectId)?.is_owner) ?? null;

  const handleAssign = async (memberId: string | null) => {
    if (!memberId) return;
    setIsSubmitting(true);
    try {
      await assignProjectOwner(workspaceSlug, projectId, memberId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project.owner_section.toast.success_title"),
        message: t("project.owner_section.toast.assign_success"),
      });
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("project.owner_section.toast.error_title"),
        message: err?.error ?? t("project.owner_section.toast.assign_error"),
      });
    } finally {
      setIsSubmitting(false);
      setPendingOwnerId(null);
    }
  };

  const handleRevoke = async () => {
    setIsSubmitting(true);
    try {
      await revokeProjectOwner(workspaceSlug, projectId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project.owner_section.toast.success_title"),
        message: t("project.owner_section.toast.revoke_success"),
      });
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("project.owner_section.toast.error_title"),
        message: err?.error ?? t("project.owner_section.toast.revoke_error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-lg border border-subtle bg-layer-2 p-4">
      <div className="flex items-center gap-2">
        <h4 className="text-14 font-medium">{t("project.owner_section.title")}</h4>
        <Tooltip tooltipContent={t("project.owner_section.tooltip")}>
          <Crown className="size-3.5 text-tertiary" />
        </Tooltip>
      </div>

      {!canManageProjectOwner ? (
        <p className="text-13 text-tertiary">{t("project.owner_section.permission_hint")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-13 text-secondary">{t("project.owner_section.current_owner_label")}</span>
            <MemberDropdown
              memberIds={eligibleAdminIds}
              multiple={false}
              value={currentOwnerId ?? pendingOwnerId}
              onChange={(value) => {
                setPendingOwnerId(value);
                handleAssign(value);
              }}
              placeholder={t("project.owner_section.no_owner_placeholder")}
              buttonVariant="border-with-text"
              disabled={isSubmitting}
              showUserDetails
            />
            {eligibleAdminIds.length === 0 && (
              <p className="text-caption-sm-regular text-tertiary">{t("project.owner_section.no_eligible_admin")}</p>
            )}
          </div>
          {currentOwnerId && (
            <Button variant="secondary" size="sm" className="w-fit" onClick={handleRevoke} loading={isSubmitting}>
              {t("project.owner_section.revoke_button")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
