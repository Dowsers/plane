/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TProfileSettingsTabs } from "@plane/types";

export enum PROFILE_SETTINGS_CATEGORY {
  YOUR_PROFILE = "your profile",
  DEVELOPER = "developer",
}

export const PROFILE_SETTINGS_CATEGORIES: PROFILE_SETTINGS_CATEGORY[] = [
  PROFILE_SETTINGS_CATEGORY.YOUR_PROFILE,
  PROFILE_SETTINGS_CATEGORY.DEVELOPER,
];

export const PROFILE_SETTINGS: Record<
  TProfileSettingsTabs,
  {
    key: TProfileSettingsTabs;
    i18n_label: string;
  }
> = {
  general: {
    key: "general",
    i18n_label: "profile.actions.profile",
  },
  security: {
    key: "security",
    i18n_label: "profile.actions.security",
  },
  permissions: {
    key: "permissions",
    i18n_label: "profile.actions.permissions",
  },
  activity: {
    key: "activity",
    i18n_label: "profile.actions.activity",
  },
  preferences: {
    key: "preferences",
    i18n_label: "profile.actions.preferences",
  },
  notifications: {
    key: "notifications",
    i18n_label: "profile.actions.notifications",
  },
  "api-tokens": {
    key: "api-tokens",
    i18n_label: "profile.actions.api-tokens",
  },
};

export const PROFILE_SETTINGS_TABS: TProfileSettingsTabs[] = Object.keys(PROFILE_SETTINGS) as TProfileSettingsTabs[];

export const GROUPED_PROFILE_SETTINGS: Record<
  PROFILE_SETTINGS_CATEGORY,
  { key: TProfileSettingsTabs; i18n_label: string }[]
> = {
  [PROFILE_SETTINGS_CATEGORY.YOUR_PROFILE]: [
    PROFILE_SETTINGS["general"],
    PROFILE_SETTINGS["preferences"],
    PROFILE_SETTINGS["notifications"],
    PROFILE_SETTINGS["security"],
    PROFILE_SETTINGS["activity"],
    // Category 11 (docs/feature-specs/11-admin-security-sso.md in
    // plane-selfhost), feature 4, user story 5 - read-only "my effective
    // permissions" summary, workspace-scoped (see the tab's own root
    // component for why this needs an explicit workspace picker rather
    // than `useWorkspace().currentWorkspace`, which is null on this
    // account-level `/settings/profile/...` route).
    PROFILE_SETTINGS["permissions"],
  ],
  [PROFILE_SETTINGS_CATEGORY.DEVELOPER]: [PROFILE_SETTINGS["api-tokens"]],
};
