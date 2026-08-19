/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPaginationInfo } from "./common";
import type { ICycle } from "./cycle";
import type { TUserPermissions } from "./enums";
import type { TProjectMembership } from "./project";
import type { IUser, IUserLite } from "./users";
import type { TLoginMediums } from "./instance";
import type { IWorkspaceViewProps } from "./view-props";

export enum EUserWorkspaceRoles {
  ADMIN = 20,
  MEMBER = 15,
  GUEST = 5,
}

export interface IWorkspace {
  readonly id: string;
  readonly owner: IUser;
  readonly created_at: Date;
  readonly updated_at: Date;
  name: string;
  url: string;
  logo_url: string | null;
  readonly total_members: number;
  readonly slug: string;
  readonly created_by: string;
  readonly updated_by: string;
  organization_size: string;
  total_projects?: number;
  role: number;
  timezone: string;
  is_initiatives_enabled?: boolean;
  is_roadmap_enabled?: boolean;
  // Category 8, feature 1 - see `Workspace.is_flexible_query_enabled`'s own
  // field comment (apps/api/plane/db/models/workspace.py) for why this is a
  // second, independent gate alongside the instance-wide
  // `FLEXIBLE_QUERY_ENABLED` env var.
  is_flexible_query_enabled?: boolean;
  // Category 9, feature 4 - "AI thread summary" Settings > AI toggle. Also
  // requires a `WorkspaceAIConfig` with `is_enabled: true` before a summary
  // can actually be generated - see `Workspace.is_ai_summary_enabled`'s own
  // field comment (apps/api/plane/db/models/workspace.py).
  is_ai_summary_enabled?: boolean;
  // Category 9, feature 6 - "AI-assisted status update drafting" Settings >
  // AI toggle (PROJECT-only in this fork - see `Workspace.
  // is_ai_update_draft_enabled`'s own field comment,
  // apps/api/plane/db/models/workspace.py). Also requires a
  // `WorkspaceAIConfig` with `is_enabled: true` before drafting can
  // actually be triggered, same convention as `is_ai_summary_enabled`.
  is_ai_update_draft_enabled?: boolean;
  // How much issue detail is sent to the LLM when drafting a status
  // update - see `WorkspaceAIUpdateDataScope` (apps/api/plane/db/models/workspace.py).
  ai_update_data_scope?: TWorkspaceAIUpdateDataScope;
  // Max AI generations per unpublished draft-editing cycle before the
  // draft endpoint returns 429 (default 5).
  max_ai_update_regenerations?: number;
  // Workspace-wide daily cap on AI update-draft generation calls (default 50).
  ai_update_daily_generation_limit?: number;
  // Category 9, feature 1 - "AI-assisted auto-triage" Settings > AI toggle
  // (workspace master switch - see `Workspace.is_ai_triage_enabled`'s own
  // field comment, apps/api/plane/db/models/workspace.py). A project's own
  // `is_ai_triage_enabled` (nullable tri-state, exposed via the dedicated
  // `.../ai-triage-config/` endpoint, not here) only matters if this is
  // ALSO true - see `is_ai_triage_enabled_for_project`
  // (apps/api/plane/utils/issue_triage_suggestion.py).
  is_ai_triage_enabled?: boolean;
}

/** `Workspace.ai_update_data_scope` choices - see `WorkspaceAIUpdateDataScope`
 * (apps/api/plane/db/models/workspace.py). Default `TITLES_STATES_ONLY` never
 * sends full issue descriptions to the external LLM provider. */
export type TWorkspaceAIUpdateDataScope = "TITLES_STATES_ONLY" | "FULL_DESCRIPTIONS";

export interface IWorkspaceLite {
  readonly id: string;
  name: string;
  slug: string;
}

export interface IWorkspaceMemberInvitation {
  accepted: boolean;
  email: string;
  id: string;
  message: string;
  responded_at: Date;
  role: TUserPermissions;
  token: string;
  invite_link: string;
  workspace: {
    id: string;
    logo_url: string;
    name: string;
    slug: string;
  };
}

export interface IWorkspaceBulkInviteFormData {
  emails: { email: string; role: TUserPermissions }[];
}

export type Properties = {
  assignee: boolean;
  start_date: boolean;
  due_date: boolean;
  labels: boolean;
  key: boolean;
  priority: boolean;
  state: boolean;
  sub_issue_count: boolean;
  link: boolean;
  attachment_count: boolean;
  estimate: boolean;
  created_on: boolean;
  updated_on: boolean;
};

export interface IWorkspaceMember {
  id: string;
  member: IUserLite;
  role: TUserPermissions | EUserWorkspaceRoles;
  created_at?: string;
  avatar_url?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  joining_date?: string;
  display_name?: string;
  last_login_medium?: TLoginMediums;
  is_active?: boolean;
}

export interface IWorkspaceMemberMe {
  company_role: string | null;
  created_at: Date;
  created_by: string;
  default_props: IWorkspaceViewProps;
  id: string;
  member: string;
  role: TUserPermissions | EUserWorkspaceRoles;
  updated_at: Date;
  updated_by: string;
  view_props: IWorkspaceViewProps;
  workspace: string;
  draft_issue_count: number;
}

export interface ILastActiveWorkspaceDetails {
  workspace_details: IWorkspace;
  project_details?: TProjectMembership[];
}

export interface IWorkspaceDefaultSearchResult {
  id: string;
  name: string;
  project_id: string;
  project__identifier: string;
  workspace__slug: string;
}
export interface IWorkspaceSearchResult {
  id: string;
  name: string;
  slug: string;
}

export interface IWorkspaceIssueSearchResult {
  id: string;
  name: string;
  project__identifier: string;
  project_id: string;
  sequence_id: number;
  workspace__slug: string;
  type_id: string;
}

export interface IWorkspacePageSearchResult {
  id: string;
  name: string;
  project_ids: string[];
  project__identifiers: string[];
  workspace__slug: string;
}

export interface IWorkspaceProjectSearchResult {
  id: string;
  identifier: string;
  name: string;
  workspace__slug: string;
}

export interface IWorkspaceSearchResults {
  results: {
    workspace: IWorkspaceSearchResult[];
    project: IWorkspaceProjectSearchResult[];
    issue: IWorkspaceIssueSearchResult[];
    cycle: IWorkspaceDefaultSearchResult[];
    module: IWorkspaceDefaultSearchResult[];
    issue_view: IWorkspaceDefaultSearchResult[];
    page: IWorkspacePageSearchResult[];
  };
}

export interface IProductUpdateResponse {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  author: {
    login: string;
    id: string;
    node_id: string;
    avatar_url: string;
    gravatar_id: "";
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: false;
  };
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  prerelease: true;
  created_at: string;
  published_at: string;
  assets: [];
  tarball_url: string;
  zipball_url: string;
  body: string;
  reactions: {
    url: string;
    total_count: number;
    "+1": number;
    "-1": number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  };
}

export interface IWorkspaceActiveCyclesResponse {
  count: number;
  extra_stats: null;
  next_cursor: string;
  next_page_results: boolean;
  prev_cursor: string;
  prev_page_results: boolean;
  results: ICycle[];
  total_pages: number;
}

export interface IWorkspaceProgressResponse {
  completed_issues: number;
  total_issues: number;
  started_issues: number;
  cancelled_issues: number;
  unstarted_issues: number;
}
export interface IWorkspaceAnalyticsResponse {
  completion_chart: Record<string, unknown>;
}

export type TWorkspacePaginationInfo = TPaginationInfo & {
  results: IWorkspace[];
};

export interface IWorkspaceSidebarNavigationItem {
  key?: string;
  is_pinned: boolean;
  sort_order: number;
}

export interface IWorkspaceSidebarNavigation {
  [key: string]: IWorkspaceSidebarNavigationItem;
}

export enum EOnboardingSteps {
  PROFILE_SETUP = "PROFILE_SETUP",
  ROLE_SETUP = "ROLE_SETUP",
  USE_CASE_SETUP = "USE_CASE_SETUP",
  WORKSPACE_CREATE_OR_JOIN = "WORKSPACE_CREATE_OR_JOIN",
  INVITE_MEMBERS = "INVITE_MEMBERS",
}

export type TOnboardingStep = EOnboardingSteps;

export enum ECreateOrJoinWorkspaceViews {
  WORKSPACE_CREATE = "WORKSPACE_CREATE",
  WORKSPACE_JOIN = "WORKSPACE_JOIN",
}
