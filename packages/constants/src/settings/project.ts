/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { EUserProjectRoles } from "@plane/types";
import type { TProjectSettingsItem, TProjectSettingsTabs } from "@plane/types";

export enum PROJECT_SETTINGS_CATEGORY {
  GENERAL = "general",
  FEATURES = "features",
  WORK_STRUCTURE = "work-structure",
  EXECUTION = "execution",
}

export const PROJECT_SETTINGS_CATEGORIES: PROJECT_SETTINGS_CATEGORY[] = [
  PROJECT_SETTINGS_CATEGORY.GENERAL,
  PROJECT_SETTINGS_CATEGORY.FEATURES,
  PROJECT_SETTINGS_CATEGORY.WORK_STRUCTURE,
  PROJECT_SETTINGS_CATEGORY.EXECUTION,
];

export const PROJECT_SETTINGS: Record<TProjectSettingsTabs, TProjectSettingsItem> = {
  general: {
    key: "general",
    i18n_label: "common.general",
    href: ``,
    access: [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER, EUserProjectRoles.GUEST],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/`,
  },
  members: {
    key: "members",
    i18n_label: "common.members",
    href: `/members`,
    access: [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER, EUserProjectRoles.GUEST],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/members/`,
  },
  features_cycles: {
    key: "features_cycles",
    i18n_label: "project_settings.features.cycles.short_title",
    href: `/features/cycles`,
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/cycles/`,
  },
  features_modules: {
    key: "features_modules",
    i18n_label: "project_settings.features.modules.short_title",
    href: `/features/modules`,
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/modules/`,
  },
  features_views: {
    key: "features_views",
    i18n_label: "project_settings.features.views.short_title",
    href: `/features/views`,
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/views/`,
  },
  features_pages: {
    key: "features_pages",
    i18n_label: "project_settings.features.pages.short_title",
    href: `/features/pages`,
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/pages/`,
  },
  features_intake: {
    key: "features_intake",
    i18n_label: "project_settings.features.intake.short_title",
    href: `/features/intake`,
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/features/intake/`,
  },
  states: {
    key: "states",
    i18n_label: "common.states",
    href: `/states`,
    access: [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/states/`,
  },
  labels: {
    key: "labels",
    i18n_label: "common.labels",
    href: `/labels`,
    access: [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/labels/`,
  },
  estimates: {
    key: "estimates",
    i18n_label: "common.estimates",
    href: `/estimates`,
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/estimates/`,
  },
  automations: {
    key: "automations",
    i18n_label: "project_settings.automations.label",
    href: `/automations`,
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/automations/`,
  },
  recurring_issue_templates: {
    key: "recurring_issue_templates",
    i18n_label: "project_settings.recurring_issue_templates.label",
    href: `/recurring-issue-templates`,
    // Matches the backend's own READ_ROLES for this feature (Admin/Member/
    // Guest) - unlike every other tab here, Guests can see this one, just
    // without any of the write actions inside it.
    access: [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER, EUserProjectRoles.GUEST],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/recurring-issue-templates/`,
  },
  governed_workflows: {
    key: "governed_workflows",
    i18n_label: "project_settings.governed_workflows.label",
    href: `/governed-workflows`,
    // `WorkflowTransitionViewSet` (apps/api/plane/app/views/workflow_transition/base.py)
    // is Admin-only for every verb, including read - Member/Guest never see
    // this tab at all, matching the sibling `automations` tab's own gating.
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/governed-workflows/`,
  },
  ai_triage: {
    key: "ai_triage",
    i18n_label: "project_settings.ai_triage.label",
    href: `/ai-triage`,
    // `ProjectAITriageConfigEndpoint` (apps/api/plane/app/views/ai_triage_config.py)
    // is Admin-only for every verb, including read - matches the sibling
    // `governed_workflows`/`automations` tabs' own gating.
    access: [EUserProjectRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/ai-triage/`,
  },
};

export const PROJECT_SETTINGS_FLAT_MAP: TProjectSettingsItem[] = Object.values(PROJECT_SETTINGS);

export const GROUPED_PROJECT_SETTINGS: Record<PROJECT_SETTINGS_CATEGORY, TProjectSettingsItem[]> = {
  [PROJECT_SETTINGS_CATEGORY.GENERAL]: [PROJECT_SETTINGS["general"], PROJECT_SETTINGS["members"]],
  [PROJECT_SETTINGS_CATEGORY.FEATURES]: [
    PROJECT_SETTINGS["features_cycles"],
    PROJECT_SETTINGS["features_modules"],
    PROJECT_SETTINGS["features_views"],
    PROJECT_SETTINGS["features_pages"],
    PROJECT_SETTINGS["features_intake"],
  ],
  [PROJECT_SETTINGS_CATEGORY.WORK_STRUCTURE]: [
    PROJECT_SETTINGS["states"],
    PROJECT_SETTINGS["labels"],
    PROJECT_SETTINGS["estimates"],
  ],
  [PROJECT_SETTINGS_CATEGORY.EXECUTION]: [
    PROJECT_SETTINGS["automations"],
    PROJECT_SETTINGS["recurring_issue_templates"],
    PROJECT_SETTINGS["governed_workflows"],
    PROJECT_SETTINGS["ai_triage"],
  ],
};
