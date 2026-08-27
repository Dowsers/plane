/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TWorkspaceSettingsItem, TWorkspaceSettingsTabs } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";

export enum WORKSPACE_SETTINGS_CATEGORY {
  ADMINISTRATION = "administration",
  FEATURES = "features",
  DEVELOPER = "developer",
}

export const WORKSPACE_SETTINGS_CATEGORIES: WORKSPACE_SETTINGS_CATEGORY[] = [
  WORKSPACE_SETTINGS_CATEGORY.ADMINISTRATION,
  WORKSPACE_SETTINGS_CATEGORY.FEATURES,
  WORKSPACE_SETTINGS_CATEGORY.DEVELOPER,
];

export const WORKSPACE_SETTINGS: Record<TWorkspaceSettingsTabs, TWorkspaceSettingsItem> = {
  general: {
    key: "general",
    i18n_label: "workspace_settings.settings.general.title",
    href: `/settings`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/`,
  },
  members: {
    key: "members",
    i18n_label: "workspace_settings.settings.members.title",
    href: `/settings/members`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/members/`,
  },
  "billing-and-plans": {
    key: "billing-and-plans",
    i18n_label: "workspace_settings.settings.billing_and_plans.title",
    href: `/settings/billing`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/billing/`,
  },
  export: {
    key: "export",
    i18n_label: "workspace_settings.settings.exports.title",
    href: `/settings/exports`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/exports/`,
  },
  webhooks: {
    key: "webhooks",
    i18n_label: "workspace_settings.settings.webhooks.title",
    href: `/settings/webhooks`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/webhooks/`,
  },
  features: {
    key: "features",
    i18n_label: "initiatives.settings.title",
    href: `/settings/features`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/features/`,
  },
  "project-templates": {
    key: "project-templates",
    i18n_label: "project_templates.settings.title",
    href: `/settings/project-templates`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/project-templates/`,
  },
  "page-templates": {
    key: "page-templates",
    i18n_label: "page_templates.settings.title",
    href: `/settings/page-templates`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/page-templates/`,
  },
  "sla-policies": {
    key: "sla-policies",
    i18n_label: "sla_policies.settings.title",
    href: `/settings/sla-policies`,
    // Mirrors the backend's own Admin-only-for-every-verb gating
    // (`SLAPolicyViewSet`/`SLAPolicyDuplicateEndpoint`/`SLAReportEndpoint`,
    // apps/api/plane/app/views/sla/{base,report}.py) - Member/Guest never
    // see this configuration screen at all, only the read-only per-issue
    // SLA status widget in the issue detail sidebar.
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/sla-policies/`,
  },
  api: {
    key: "api",
    i18n_label: "flexible_query.settings.title",
    href: `/settings/api`,
    // Readable by every member (the toggle/quota are useful context even
    // for non-admins integrating against this workspace's API), editing
    // is gated Admin-only inside the page itself - mirrors the backend's
    // own split (`WorkspaceQuerySettingsEndpoint.get` has no role gate,
    // `.patch` is `ROLE.ADMIN`).
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/api/`,
  },
  ai: {
    key: "ai",
    i18n_label: "ai.settings.title",
    href: `/settings/ai`,
    // Mirrors the backend's own Admin-only-for-every-verb gating
    // (`WorkspaceAIConfigEndpoint`/`WorkspaceAIConfigTestEndpoint`,
    // apps/api/plane/app/views/workspace_ai_config.py, both
    // `level="WORKSPACE"` + `ROLE.ADMIN`) - Member/Guest never see this
    // configuration screen, only the read-only AI summary section in the
    // issue detail sidebar once an admin has enabled it.
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/ai/`,
  },
  "api-explorer": {
    key: "api-explorer",
    i18n_label: "api_explorer.settings.title",
    href: `/settings/api-explorer`,
    // Spec exigence 14 (docs/feature-specs/08-api-webhooks-cli.md, "6.
    // Explorateur d'API interactif", in plane-selfhost): hidden entirely
    // for Guest (excluded from this array, same convention every other
    // tab here already uses), visible read-only for Member, execution
    // additionally gated Admin-only (or Member if the workspace's own
    // `allow_members_execute` toggle is on) inside the page itself.
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/api-explorer/`,
  },
  wiki: {
    key: "wiki",
    i18n_label: "wiki.settings.title",
    href: `/settings/wiki`,
    // Category 10, feature 4 ("Wiki workspace en GA") exigence 4 -
    // readable by every member (the current root-creation policy is
    // useful context even for a non-admin), editing the
    // `wiki_root_creation_role` control itself is gated Admin-only inside
    // the page, mirroring the `api`/`api-explorer` split above.
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/wiki/`,
  },
  security: {
    key: "security",
    i18n_label: "workspace_settings.settings.security.title",
    href: `/settings/security`,
    // Category 11 (docs/feature-specs/11-admin-security-sso.md in
    // plane-selfhost), features 3+5 merged, exigence 6/15 - the tab itself
    // is only ever hidden from Member/Guest at this nav-level Admin gate
    // (mirrors `ai`/`sla-policies` above); the STRICTER real-Owner-only
    // restriction (an Admin who isn't the Owner never sees the audit log
    // or the OAuth-adjacent settings this tab hosts) is enforced inside
    // the page itself via `is_owner`, not here - the backend's own
    // `IsWorkspaceOwner` permission is real ownership, not a role, so it
    // can't be expressed in this role-only `access` array.
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/security/`,
  },
  slack: {
    key: "slack",
    i18n_label: "slack_integration.settings.title",
    href: `/settings/slack`,
    // 14d ("Intake Email and Slack", levee du squelette, section 3,
    // exigence 10) - the Slack WORKSPACE connection itself (bot token/
    // signing secret, channel<->project mappings across every project)
    // is scoped Admin-only, mirroring the backend's own
    // `@allow_permission([ROLE.ADMIN], level="WORKSPACE")` on
    // `SlackWorkspaceConnectEndpoint`/`SlackWorkspaceConnectionEndpoint`.
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/slack/`,
  },
  "permission-bundles": {
    key: "permission-bundles",
    i18n_label: "permission_bundles.settings.title",
    href: `/settings/permission-bundles`,
    // Category 11 (docs/feature-specs/11-admin-security-sso.md in
    // plane-selfhost), feature 4 - nav-level gate mirrors `security` above
    // (Admin visibility; the backend's own default seed grants
    // `workspace.manage_roles` unconditionally to the system Admin role's
    // own baseline bundle, not just to the real Owner - see
    // `WorkspaceManageRolesPermission`/`SYSTEM_SCHEME_ITEMS["Admin"]`).
    // The stricter, REAL enforcement is still the backend's own 403 on
    // every endpoint under this screen - this array only controls whether
    // the tab is shown at all, matching every other Admin-only tab here.
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/permission-bundles/`,
  },
};

export const WORKSPACE_SETTINGS_ACCESS = Object.fromEntries(
  Object.entries(WORKSPACE_SETTINGS).map(([_, { href, access }]) => [href, access])
);

export const GROUPED_WORKSPACE_SETTINGS: Record<WORKSPACE_SETTINGS_CATEGORY, TWorkspaceSettingsItem[]> = {
  [WORKSPACE_SETTINGS_CATEGORY.ADMINISTRATION]: [
    WORKSPACE_SETTINGS["general"],
    WORKSPACE_SETTINGS["members"],
    WORKSPACE_SETTINGS["billing-and-plans"],
    WORKSPACE_SETTINGS["export"],
    WORKSPACE_SETTINGS["project-templates"],
    WORKSPACE_SETTINGS["page-templates"],
    WORKSPACE_SETTINGS["sla-policies"],
    WORKSPACE_SETTINGS["ai"],
    WORKSPACE_SETTINGS["slack"],
    WORKSPACE_SETTINGS["security"],
    WORKSPACE_SETTINGS["permission-bundles"],
  ],
  [WORKSPACE_SETTINGS_CATEGORY.FEATURES]: [WORKSPACE_SETTINGS["features"], WORKSPACE_SETTINGS["wiki"]],
  [WORKSPACE_SETTINGS_CATEGORY.DEVELOPER]: [
    WORKSPACE_SETTINGS["webhooks"],
    WORKSPACE_SETTINGS["api"],
    WORKSPACE_SETTINGS["api-explorer"],
  ],
};
