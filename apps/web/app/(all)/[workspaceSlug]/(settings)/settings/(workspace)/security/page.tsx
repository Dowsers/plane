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
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { RestrictedToOwnerView } from "@/components/workspace/settings/security/restricted-view";
import { WorkspaceSecurityAuditLog } from "@/components/workspace/settings/security/audit-log-root";
import { SecurityPolicyPanel } from "@/components/workspace/settings/security/security-policy-panel";
import { VerifiedDomainsPanel } from "@/components/workspace/settings/security/verified-domains-panel";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { SecurityWorkspaceSettingsHeader } from "./header";

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3 ("Journal d'audit de securite workspace") +
 * 5 ("Role Owner dedie + Team/Project Owner delegue") + 6 ("Politiques de
 * securite configurables") merged - Workspace Settings > Security.
 * Two-tier gating, matching the backend exactly:
 * (1) nav-level - Admin-only (Member/Guest never even see the tab, see
 *     `WORKSPACE_SETTINGS.security` in @plane/constants);
 * (2) page-level - feature 6's security-policy/verified-domains panels are
 *     Admin-READ / Owner-WRITE (`WorkspaceSecurityPolicyEndpoint`/
 *     `WorkspaceVerifiedDomainEndpoint` are both `@allow_permission([ROLE.
 *     ADMIN])` for GET, Owner-only for every write) - a non-Owner Admin
 *     sees the same values as the Owner, just with every control disabled,
 *     via each panel's own `isOwner` prop. The audit log section below
 *     stays real-Owner-only end to end (`is_owner`, NOT a role) - a
 *     non-Owner Admin sees the `RestrictedToOwnerView` empty state there
 *     instead, mirroring the backend's own `IsWorkspaceOwner`-gated
 *     `WorkspaceAuditLogViewSet` (403 for any non-Owner, including Admin).
 */
function SecuritySettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions, workspaceInfoBySlug } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // derived values
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const isOwner = Boolean(workspaceInfoBySlug(workspaceSlug)?.is_owner);
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Security` : undefined;

  if (workspaceUserInfo && !isWorkspaceAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<SecurityWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-10">
        <div className="flex flex-col gap-y-4">
          <SettingsHeading
            title="Security policy"
            description={
              isOwner
                ? "Configure sign-in and session rules for this workspace."
                : "Sign-in and session rules for this workspace - read-only, reserved for the workspace Owner."
            }
          />
          <SecurityPolicyPanel workspaceSlug={workspaceSlug} isOwner={isOwner} />
        </div>

        <div className="flex flex-col gap-y-4">
          <SettingsHeading
            title="Verified domains"
            description="Prove ownership of an email domain to enforce SSO-only login for it."
          />
          <VerifiedDomainsPanel workspaceSlug={workspaceSlug} isOwner={isOwner} />
        </div>

        <div className="flex flex-col gap-y-4">
          <SettingsHeading
            title="Audit log"
            description="Audit log of sensitive workspace actions - reserved for the workspace Owner."
          />
          {isOwner ? <WorkspaceSecurityAuditLog workspaceSlug={workspaceSlug} /> : <RestrictedToOwnerView />}
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(SecuritySettingsPage);
