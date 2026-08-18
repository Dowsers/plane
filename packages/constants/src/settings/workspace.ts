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
    WORKSPACE_SETTINGS["sla-policies"],
    WORKSPACE_SETTINGS["ai"],
  ],
  [WORKSPACE_SETTINGS_CATEGORY.FEATURES]: [WORKSPACE_SETTINGS["features"]],
  [WORKSPACE_SETTINGS_CATEGORY.DEVELOPER]: [
    WORKSPACE_SETTINGS["webhooks"],
    WORKSPACE_SETTINGS["api"],
    WORKSPACE_SETTINGS["api-explorer"],
  ],
};
