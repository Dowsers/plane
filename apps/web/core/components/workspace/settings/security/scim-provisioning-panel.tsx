/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { SettingsHeading } from "@/components/settings/heading";
// local imports
import { SCIMProvisioningLog } from "./scim-provisioning-log";
import { SCIMTokenPanel } from "./scim-token-panel";

type Props = {
  workspaceSlug: string;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 2 ("SCIM 2.0 natif") - Workspace Settings >
 * Security > "SCIM Provisioning" sub-section. Landed as a 4th sub-section
 * of the existing merged Security tab (features 3+5+6 already built 3
 * sub-sections there - security policy / verified domains / audit log)
 * rather than a new top-level nav entry: the spec's own suggested location
 * ("Nouvel onglet Parametres du workspace > Securite > SCIM Provisioning")
 * literally nests it INSIDE Security, and this fork's settings navigation
 * has no existing convention for stacking sibling tabs under a single
 * settings group beyond what's already there - every other prior feature
 * in this category (3+5, 6) chose the sub-section route over a new nav
 * entry for the exact same reason. Access gating is handled entirely by
 * the PARENT (`security/page.tsx`) rendering this component only when
 * BOTH `ENABLE_SCIM` is on instance-wide AND the current user is workspace
 * Admin+ - unlike the audit log section below it on the same page, there
 * is no stricter Owner-only inner gate here (exigence 3/10's own "Owner ou
 * Admin" wording, matching the backend's `ROLE.ADMIN` check on both
 * `WorkspaceSCIMTokenEndpoint` and `WorkspaceSCIMProvisioningLogEndpoint`).
 */
export const SCIMProvisioningPanel = observer(function SCIMProvisioningPanel(props: Props) {
  const { workspaceSlug } = props;

  return (
    <div className="flex flex-col gap-y-8">
      <div className="flex flex-col gap-y-3">
        <SettingsHeading
          title="SCIM token"
          description="Generate a token and connect it to your identity provider (Okta, Azure AD, Google Workspace) to automatically create, update, and deactivate members."
        />
        <SCIMTokenPanel workspaceSlug={workspaceSlug} />
      </div>

      <div className="flex flex-col gap-y-3">
        <SettingsHeading
          title="Provisioning log"
          description="The last 90 days of SCIM create/update/deactivate/sync-error events for this workspace."
        />
        <SCIMProvisioningLog workspaceSlug={workspaceSlug} />
      </div>
    </div>
  );
});
