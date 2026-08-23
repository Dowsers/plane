/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";
import type { TUserPermissions } from "../enums";
import type { TInitiativeHealth } from "../initiative";
import type { TIssuePriorities } from "../issues";
import type { TProjectUpdateCadence, TProjectUpdateStatus } from "../project-update";
import type { TStateGroups } from "../state";
import type { IUser, IUserLite } from "../users";
import type { IWorkspace } from "../workspace";

export enum EUserProjectRoles {
  ADMIN = 20,
  MEMBER = 15,
  GUEST = 5,
}

export interface IPartialProject {
  id: string;
  name: string;
  identifier: string;
  sort_order: number | null;
  logo_props: TLogoProps;
  member_role?: TUserPermissions | EUserProjectRoles | null;
  archived_at: string | null;
  workspace: IWorkspace | string;
  cycle_view: boolean;
  issue_views_view: boolean;
  module_view: boolean;
  page_view: boolean;
  inbox_view: boolean;
  guest_view_all_features?: boolean;
  project_lead?: IUserLite | string | null;
  network?: number;
  health?: TInitiativeHealth | null;
  initiative_ids?: string[];
  latest_update_status?: TProjectUpdateStatus | null;
  update_cadence?: TProjectUpdateCadence;
  update_reminder_day?: number | null;
  update_reminder_enabled?: boolean;
  update_owner?: string | null;
  next_update_due_at?: string | null;
  priority?: TIssuePriorities;
  start_date?: string | null;
  target_date?: string | null;
  // Timestamps
  created_at?: Date;
  updated_at?: Date;
  // actor
  created_by?: string;
  updated_by?: string;
  intake_count?: number;
}

export interface IProject extends IPartialProject {
  archive_in?: number;
  close_in?: number;
  sub_issue_auto_close?: boolean;
  sub_issue_auto_close_state?: string | null;
  sub_issue_cascade_close?: boolean;
  // only for uploading the cover image
  cover_image_asset?: null;
  cover_image?: string;
  // only for rendering the cover image
  readonly cover_image_url?: string;
  default_assignee?: IUser | string | null;
  default_state?: string | null;
  description?: string;
  estimate?: string | null;
  anchor?: string | null;
  is_favorite?: boolean;
  members?: string[];
  timezone?: string;
  next_work_item_sequence?: number;
  // Rolling window (in closed cycles) used to compute average/optimistic/
  // pessimistic velocity on the "Scope & velocity" project chart - see
  // docs/feature-specs/05-insights-analytics.md ("Graphiques de
  // progression cycle/projet") in plane-selfhost.
  velocity_window_size?: number;
}

export type TProjectAnalyticsCountParams = {
  project_ids?: string;
  fields?: string;
};

export type TProjectAnalyticsCount = Pick<IProject, "id"> & {
  total_issues?: number;
  completed_issues?: number;
  total_cycles?: number;
  total_members?: number;
  total_modules?: number;
};

export interface IProjectLite {
  id: string;
  name: string;
  identifier: string;
  logo_props: TLogoProps;
}

export interface IProjectMap {
  [id: string]: IProject;
}

export interface IProjectMemberLite {
  id: string;
  member__avatar_url: string;
  member__display_name: string;
  member_id: string;
}

export type TProjectMembership = {
  member: string;
  role: TUserPermissions | EUserProjectRoles;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 5 - persisted (unlike the workspace-level
  // `IWorkspaceMember.is_owner`, a computed property) flag exposed by
  // `ProjectMemberAdminSerializer`/`ProjectMemberRoleSerializer`
  // (apps/api/plane/app/serializers/project.py). Read-only on every
  // serializer that exposes it - only ever changes via the dedicated
  // `POST/DELETE .../projects/<id>/owner/` endpoint.
  is_owner?: boolean;
} & (
  | {
      id: string;
      original_role: EUserProjectRoles;
      created_at: string;
    }
  | {
      id: null;
      original_role: null;
      created_at: null;
    }
);

export interface IProjectBulkAddFormData {
  members: { role: TUserPermissions | EUserProjectRoles; member_id: string }[];
}

export type IProjectMemberNavigationPreferences = {
  default_tab: string;
  hide_in_more_menu: string[];
};

export type IProjectMemberPreferencesUpdate = {
  navigation: IProjectMemberNavigationPreferences;
};

export type IProjectMemberPreferencesResponse = {
  preferences: {
    navigation: IProjectMemberNavigationPreferences;
  };
};

export type IProjectMemberPreferencesFullResponse = IProjectMemberPreferencesResponse & {
  project_id: string;
  member_id: string;
  workspace_id: string;
};

export interface IGithubRepository {
  id: string;
  full_name: string;
  html_url: string;
  url: string;
}

export interface GithubRepositoriesResponse {
  repositories: IGithubRepository[];
  total_count: number;
}

export type TProjectIssuesSearchParams = {
  search: string;
  parent?: boolean;
  issue_relation?: boolean;
  cycle?: boolean;
  module?: string;
  sub_issue?: boolean;
  issue_id?: string;
  workspace_search: boolean;
  target_date?: string;
  epic?: boolean;
};

export interface ISearchIssueResponse {
  id: string;
  name: string;
  project_id: string;
  project__identifier: string;
  project__name: string;
  sequence_id: number;
  start_date: string | null;
  state__color: string;
  state__group: TStateGroups;
  state__name: string;
  workspace__slug: string;
  type_id: string;
}

export type TPartialProject = IPartialProject;

export type TProject = TPartialProject & IProject;
