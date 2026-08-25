/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TUserPermissions } from "./enums";
import type { IIssueActivity, TIssuePriorities, TStateGroups } from ".";
import type { TLoginMediums } from "./instance";

/**
 * @description The start of the week for the user
 * @enum {number}
 */
export enum EStartOfTheWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

export interface IUserLite {
  avatar_url: string;
  display_name: string;
  email?: string;
  first_name: string;
  id: string;
  is_bot: boolean;
  // Category 9 feature 7 (docs/feature-specs/09-ai-features.md "7. Type
  // d'acteur agent de premiere classe" in plane-selfhost) - both new,
  // always present on `UserLiteSerializer`/`UserAdminLiteSerializer`
  // responses (apps/api/plane/app/serializers/user.py). `bot_type` is the
  // raw `BotTypeEnum` string (e.g. `"WORKSPACE_AGENT"`, `"GITHUB_BOT"`,
  // `"WORKSPACE_SEED"`) or `null` for a human; `agent_type` is only
  // non-null for a `WORKSPACE_AGENT` bot (sourced from its
  // `AgentProfile.agent_type`, see `AgentTypeMixin` in that same
  // serializer file). Use `isWorkspaceAgentActor` (@plane/utils) rather
  // than checking `bot_type` directly, to stay in sync with the backend's
  // own `plane.utils.agent_actor.is_workspace_agent`.
  bot_type?: string | null;
  agent_type?: string | null;
  last_name: string;
  joining_date?: string;
}
export interface IUser extends IUserLite {
  // only for uploading the cover image
  cover_image_asset?: string | null;
  cover_image?: string | null;
  // only for rendering the cover image
  cover_image_url: string | null;
  date_joined: string;
  email: string;
  is_active: boolean;
  is_email_verified: boolean;
  is_password_autoset: boolean;
  is_tour_completed: boolean;
  mobile_number: string | null;
  last_workspace_id: string;
  user_timezone: string;
  username: string;
  last_login_medium: TLoginMediums;
  theme: IUserTheme;
}

export interface IUserAccount {
  provider_account_id: string;
  provider: string;
  created_at: Date;
  updated_at: Date;
}

export type TUserProfile = {
  id: string | undefined;
  user: string | undefined;
  role: string | undefined;
  last_workspace_id: string | undefined;
  theme: {
    theme: string | undefined;
    primary: string | undefined;
    background: string | undefined;
    darkPalette: boolean | undefined;
  };
  onboarding_step: TOnboardingSteps;
  is_onboarded: boolean;
  is_tour_completed: boolean;
  use_case: string | undefined;
  billing_address_country: string | undefined;
  billing_address: string | undefined;
  has_billing_address: boolean;
  has_marketing_email_consent: boolean;
  language: string;
  created_at: Date | string;
  updated_at: Date | string;
  start_of_the_week: EStartOfTheWeek;
};

export interface IInstanceAdminStatus {
  is_instance_admin: boolean;
}

export interface IUserSettings {
  id: string | undefined;
  email: string | undefined;
  workspace: {
    last_workspace_id: string | undefined;
    last_workspace_slug: string | undefined;
    last_workspace_name: string | undefined;
    last_workspace_logo: string | undefined;
    fallback_workspace_id: string | undefined;
    fallback_workspace_slug: string | undefined;
    invites: number | undefined;
  };
}

export interface IUserTheme {
  theme: string | undefined; // 'light', 'dark', 'custom', etc.
  primary?: string | undefined;
  background?: string | undefined;
  darkPalette?: boolean | undefined;
}

export interface IUserMemberLite extends IUserLite {
  email?: string;
}

export interface IUserActivity {
  created_date: string;
  activity_count: number;
}

export interface IUserPriorityDistribution {
  priority: TIssuePriorities;
  priority_count: number;
}

export interface IUserStateDistribution {
  state_group: TStateGroups;
  state_count: number;
}

export interface IUserActivityResponse {
  count: number;
  extra_stats: null;
  next_cursor: string;
  next_page_results: boolean;
  prev_cursor: string;
  prev_page_results: boolean;
  results: IIssueActivity[];
  total_pages: number;
  total_results: number;
}

export type UserAuth = {
  isMember: boolean;
  isOwner: boolean;
  isGuest: boolean;
};

export type TOnboardingSteps = {
  profile_complete: boolean;
  workspace_create: boolean;
  workspace_invite: boolean;
  workspace_join: boolean;
};

export interface IUserProfileData {
  assigned_issues: number;
  completed_issues: number;
  created_issues: number;
  pending_issues: number;
  priority_distribution: IUserPriorityDistribution[];
  state_distribution: IUserStateDistribution[];
  subscribed_issues: number;
}

export interface IUserProfileProjectSegregation {
  project_data: {
    assigned_issues: number;
    completed_issues: number;
    created_issues: number;
    id: string;
    pending_issues: number;
  }[];
  user_data: Pick<IUser, "avatar_url" | "cover_image_url" | "display_name" | "first_name" | "last_name"> & {
    date_joined: Date;
    user_timezone: string;
  };
}

export interface IUserProjectsRole {
  [projectId: string]: TUserPermissions;
}

export interface IUserEmailNotificationSettings {
  property_change: boolean;
  state_change: boolean;
  comment: boolean;
  mention: boolean;
  issue_completed: boolean;
  // Category 10, feature 5 ("Abonnements/notifications par page") - mirrors
  // `UserNotificationPreference.page_edits`/`page_mentions`/`page_comments`
  // (apps/api/plane/db/models/notification.py), opt-out/default `true` like
  // every field above. `page_edits` also covers the metadata-level events
  // with no dedicated toggle of their own (rename/lock/archive/access
  // change) - see `plane.bgtasks.page_subscription_task.EVENT_PREFERENCE_FIELD`.
  page_edits: boolean;
  page_mentions: boolean;
  page_comments: boolean;
  // Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
  // plane-selfhost), feature 3 ("Notifications push en self-hosted") -
  // mirrors `UserNotificationPreference.push_*`/`quiet_hours_*`
  // (apps/api/plane/db/models/notification.py). `push_enabled` is the
  // master switch (default `false`, opt-in); the 5 `push_*` event toggles
  // are a channel fully independent from the email fields above (exigence
  // 3), default `true` once the master switch itself is on. Same
  // `PATCH /api/users/me/notification-preferences/` endpoint as every
  // other field on this interface.
  push_enabled: boolean;
  push_property_change: boolean;
  push_state_change: boolean;
  push_comment: boolean;
  push_mention: boolean;
  push_issue_completed: boolean;
  // Quiet hours - `quiet_hours_start`/`quiet_hours_end` are `"HH:MM:SS"`
  // strings (DRF `TimeField`, ISO 8601), both required together when
  // `quiet_hours_enabled` is `true` (server-validated). Uses the user's
  // existing `user_timezone` (see `IUser`) rather than a separate field.
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export type TProfileViews = "assigned" | "created" | "subscribed";

export type TPublicMember = {
  id: string;
  member: string;
  member__display_name: string;
  member__avatar: string;
};

// export interface ICurrentUser {
//   id: readonly string;
//   avatar: string;
//   first_name: string;
//   last_name: string;
//   username: string;
//   email: string;
//   mobile_number: string;
//   is_email_verified: boolean;
//   is_tour_completed: boolean;
//   onboarding_step: TOnboardingSteps;
//   is_onboarded: boolean;
//   role: string;
// }

// export interface ICustomTheme {
//   background: string;
//   text: string;
//   primary: string;
//   sidebarBackground: string;
//   sidebarText: string;
//   darkPalette: boolean;
//   palette: string;
//   theme: string;
// }

// export interface ICurrentUserSettings {
//   theme: ICustomTheme;
// }
