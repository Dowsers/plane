/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// types
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { Tabs } from "@plane/propel/tabs";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceBulkInviteFormData } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { AgentListRoot } from "@/components/agents/agent-list-root";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { CountChip } from "@/components/common/count-chip";
import { PageHead } from "@/components/core/page-title";
import { MemberListFiltersDropdown } from "@/components/project/dropdowns/filters/member-list";
import { WorkspaceMembersList } from "@/components/workspace/settings/members-list";
import { RolesTabRoot } from "@/components/workspace/settings/rbac/roles-tab-root";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// plane web components
import { BillingActionsButton } from "@/plane-web/components/workspace/billing/billing-actions-button";
import { SendWorkspaceInvitationModal, MembersActivityButton } from "@/plane-web/components/workspace/members";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// local imports
import type { Route } from "./+types/page";
import { MembersWorkspaceSettingsHeader } from "./header";

const TAB_MEMBERS = "members";
const TAB_AGENTS = "agents";
// Category 11 (docs/feature-specs/11-admin-security-sso.md in
// plane-selfhost), feature 4 - "Roles" tab, same Admin-only gate as
// "Agents" above (nav-level only; real enforcement is the backend's own
// 403 on every RBAC endpoint for anyone lacking `workspace.manage_roles`).
const TAB_ROLES = "roles";

const WorkspaceMembersSettingsPage = observer(function WorkspaceMembersSettingsPage({ params }: Route.ComponentProps) {
  // states
  const [inviteModal, setInviteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>(TAB_MEMBERS);
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const {
    workspace: { workspaceMemberIds, inviteMembersToWorkspace, filtersStore },
  } = useMember();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  // derived values
  const canPerformWorkspaceAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canPerformWorkspaceMemberActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const handleWorkspaceInvite = async (data: IWorkspaceBulkInviteFormData) => {
    try {
      await inviteMembersToWorkspace(workspaceSlug, data);

      setInviteModal(false);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("workspace_settings.settings.members.invitations_sent_successfully"),
      });
    } catch (error: unknown) {
      let message = undefined;
      if (error instanceof Error) {
        const err = error as Error & { error?: string };
        message = err.error;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: `${message ?? t("something_went_wrong_please_try_again")}`,
      });

      throw error;
    }
  };

  // Handler for role filter updates
  const handleRoleFilterUpdate = (role: string) => {
    const currentFilters = filtersStore.filters;
    const currentRoles = currentFilters?.roles || [];
    const updatedRoles = currentRoles.includes(role) ? currentRoles.filter((r) => r !== role) : [...currentRoles, role];

    filtersStore.updateFilters({
      roles: updatedRoles.length > 0 ? updatedRoles : undefined,
    });
  };

  // derived values
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Members` : undefined;
  const appliedRoleFilters = filtersStore.filters?.roles || [];

  // if user is not authorized to view this page
  if (workspaceUserInfo && !canPerformWorkspaceMemberActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  const membersSectionContent = (
    <section
      className={cn("size-full", {
        "opacity-60": !canPerformWorkspaceMemberActions,
      })}
    >
      <div className="flex items-center justify-between gap-4 pb-3.5">
        <h4 className="flex items-center gap-2.5 text-h3-medium">
          {t("workspace_settings.settings.members.title")}
          {workspaceMemberIds && workspaceMemberIds.length > 0 && (
            <CountChip count={workspaceMemberIds.length} className="m-auto h-5" />
          )}
        </h4>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5">
            <SearchIcon className="h-3.5 w-3.5 text-placeholder" />
            <input
              className="w-full max-w-[234px] border-none bg-transparent text-body-xs-regular outline-none placeholder:text-placeholder"
              placeholder={`${t("search")}...`}
              value={searchQuery}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <MemberListFiltersDropdown
            appliedFilters={appliedRoleFilters}
            handleUpdate={handleRoleFilterUpdate}
            memberType="workspace"
          />
          <MembersActivityButton workspaceSlug={workspaceSlug} />
          {canPerformWorkspaceAdminActions && (
            <Button variant="primary" size="lg" onClick={() => setInviteModal(true)}>
              {t("workspace_settings.settings.members.add_member")}
            </Button>
          )}
          <BillingActionsButton canPerformWorkspaceAdminActions={canPerformWorkspaceAdminActions} />
        </div>
      </div>
      <WorkspaceMembersList searchQuery={searchQuery} isAdmin={canPerformWorkspaceAdminActions} />
    </section>
  );

  return (
    <SettingsContentWrapper header={<MembersWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <SendWorkspaceInvitationModal
        isOpen={inviteModal}
        onClose={() => setInviteModal(false)}
        onSubmit={handleWorkspaceInvite}
      />
      {canPerformWorkspaceAdminActions ? (
        // Spec's own "Parametres d'espace de travail -> Membres : nouvel
        // onglet 'Agents'" (docs/feature-specs/09-ai-features.md "7. Type
        // d'acteur agent de premiere classe" in plane-selfhost) - the
        // "Agents" tab is Admin-only, matching the backend's own
        // Admin-only-for-every-verb gating on every `agent.py` endpoint;
        // a Member/Guest never sees the tab bar at all, only the plain
        // Members section below, unchanged from before this feature.
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as string)}>
          <Tabs.List>
            <Tabs.Trigger value={TAB_MEMBERS}>{t("workspace_settings.settings.members.title")}</Tabs.Trigger>
            <Tabs.Trigger value={TAB_AGENTS}>Agents</Tabs.Trigger>
            <Tabs.Trigger value={TAB_ROLES}>Roles</Tabs.Trigger>
            <Tabs.Indicator />
          </Tabs.List>
          <Tabs.Content value={TAB_MEMBERS} className="pt-4">
            {membersSectionContent}
          </Tabs.Content>
          <Tabs.Content value={TAB_AGENTS} className="pt-4">
            <AgentListRoot workspaceSlug={workspaceSlug} />
          </Tabs.Content>
          <Tabs.Content value={TAB_ROLES} className="pt-4">
            <RolesTabRoot workspaceSlug={workspaceSlug} />
          </Tabs.Content>
        </Tabs>
      ) : (
        membersSectionContent
      )}
    </SettingsContentWrapper>
  );
});

export default WorkspaceMembersSettingsPage;
