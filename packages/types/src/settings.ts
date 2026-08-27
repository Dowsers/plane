/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import type { EUserProjectRoles } from ".";
import type { EUserWorkspaceRoles } from "./workspace";

export type TProfileSettingsTabs =
  | "general"
  | "preferences"
  | "activity"
  | "notifications"
  | "security"
  | "api-tokens"
  | "permissions";

export type TWorkspaceSettingsTabs =
  | "general"
  | "members"
  | "billing-and-plans"
  | "export"
  | "webhooks"
  | "features"
  | "project-templates"
  | "page-templates"
  | "sla-policies"
  | "api"
  | "api-explorer"
  | "ai"
  | "wiki"
  | "security"
  | "permission-bundles";
export type TWorkspaceSettingsItem = {
  key: TWorkspaceSettingsTabs;
  i18n_label: string;
  href: string;
  access: EUserWorkspaceRoles[];
  highlight: (pathname: string, baseUrl: string) => boolean;
};

export type TProjectSettingsTabs =
  | "general"
  | "members"
  | "features_cycles"
  | "features_modules"
  | "features_views"
  | "features_pages"
  | "features_intake"
  | "features_time_tracking"
  | "states"
  | "labels"
  | "estimates"
  | "automations"
  | "recurring_issue_templates"
  | "governed_workflows"
  | "ai_triage"
  | "ai_duplicate_detection"
  | "ai_assistant";
export type TProjectSettingsItem = {
  key: TProjectSettingsTabs;
  i18n_label: string;
  href: string;
  access: EUserProjectRoles[];
  highlight: (pathname: string, baseUrl: string) => boolean;
};
