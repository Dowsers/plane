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
import { RestrictedToOwnerView } from "@/components/workspace/settings/security/restricted-view";
import { WorkspaceSecurityAuditLog } from "@/components/workspace/settings/security/audit-log-root";
import { SCIMProvisioningPanel } from "@/components/workspace/settings/security/scim-provisioning-panel";
import { SecurityPolicyPanel } from "@/components/workspace/settings/security/security-policy-panel";
import { VerifiedDomainsPanel } from "@/components/workspace/settings/security/verified-domains-panel";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
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
 *
 * Feature 2 ("SCIM 2.0 natif")'s own "SCIM Provisioning" sub-section below
 * has a THIRD, orthogonal gate on top of the page-level Admin check above:
 * the instance-wide `ENABLE_SCIM` god-mode flag (exigence 3's own "visible
 * uniquement si ENABLE_SCIM est active cote instance"). Unlike the audit
 * log section, it needs no Owner-only inner gate - `WorkspaceSCIMTokenEndpoint`/
 * `WorkspaceSCIMProvisioningLogEndpoint` are both `ROLE.ADMIN` (Owner-and-
 * Admin-both), matching the page's own top-level check exactly, so nothing
 * further needs to be hidden/disabled once a workspace Admin gets this far.
 */
function SecuritySettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions, workspaceInfoBySlug } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { config } = useInstance();
  const { t } = useTranslation();

  // derived values
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const isOwner = Boolean(workspaceInfoBySlug(workspaceSlug)?.is_owner);
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.security.title")}`
    : undefined;
  const isScimEnabled = Boolean(config?.is_scim_enabled);

  if (workspaceUserInfo && !isWorkspaceAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<SecurityWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-10">
        <div className="flex flex-col gap-y-4">
          <SettingsHeading
            title={t("security_settings.security_policy.title")}
            description={
              isOwner
                ? t("security_settings.security_policy.description_owner")
                : t("security_settings.security_policy.description_non_owner")
            }
          />
          <SecurityPolicyPanel workspaceSlug={workspaceSlug} isOwner={isOwner} />
        </div>

        <div className="flex flex-col gap-y-4">
          <SettingsHeading
            title={t("security_settings.verified_domains.title")}
            description={t("security_settings.verified_domains.description")}
          />
          <VerifiedDomainsPanel workspaceSlug={workspaceSlug} isOwner={isOwner} />
        </div>

        <div className="flex flex-col gap-y-4">
          <SettingsHeading
            title={t("security_settings.audit_log.title")}
            description={t("security_settings.audit_log.description")}
          />
          {isOwner ? <WorkspaceSecurityAuditLog workspaceSlug={workspaceSlug} /> : <RestrictedToOwnerView />}
        </div>

        {isScimEnabled && (
          <div className="flex flex-col gap-y-4">
            <SettingsHeading
              title={t("security_settings.scim_provisioning.title")}
              description={t("security_settings.scim_provisioning.description")}
            />
            <SCIMProvisioningPanel workspaceSlug={workspaceSlug} />
          </div>
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(SecuritySettingsPage);
