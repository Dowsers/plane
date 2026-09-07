/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export interface ITeamspace {
  id: string;
  name: string;
  description: string;
  workspace: string;
  logo_props: TLogoProps;
  members_count: number;
  projects_count: number;
  created_at: string;
  updated_at: string;
}

export type TTeamspaceWritePayload = Partial<Pick<ITeamspace, "name" | "description" | "logo_props">>;

export interface ITeamspaceMember {
  id: string;
  teamspace: string;
  member: string;
  member_email: string;
  member_display_name: string;
  member_avatar: string;
  role: number;
  created_at: string;
  updated_at: string;
}

export type TTeamspaceMemberWritePayload = Pick<ITeamspaceMember, "member" | "role">;

export interface ITeamspaceProject {
  id: string;
  teamspace: string;
  project: string;
  project_name: string;
  project_identifier: string;
  created_at: string;
  updated_at: string;
}

export type TTeamspaceProjectWritePayload = Pick<ITeamspaceProject, "project">;

export interface ITeamspaceDetail extends ITeamspace {
  members: ITeamspaceMember[];
  projects: ITeamspaceProject[];
}

// Category 13, feature 2 (docs/feature-specs/13-teamspaces.md, section 2) -
// read-only aggregation payloads returned by the overview/cycles/relations/
// stats endpoints (`WorkspaceTeamspace{Overview,Cycles,Relations,Stats}Endpoint`
// in apps/api/plane/app/views/workspace/teamspace.py). Kept as plain data
// shapes mirroring the backend Response bodies exactly.

export type TTeamspaceOverviewGroupBy = "priority" | "due_date" | "start_date";

export interface ITeamspaceOverviewSummary {
  backlog: number;
  unstarted: number;
  started: number;
  completed: number;
  cancelled: number;
  no_due_date: number;
}

export interface ITeamspaceProgressChartRow {
  // The grouping key field (`priority` | `target_date` | `start_date`)
  // shows up dynamically under its own name, plus the two aggregates below.
  pending: number;
  completed: number;
  [key: string]: string | number | null;
}

export interface ITeamspaceOverview {
  summary: ITeamspaceOverviewSummary;
  overdue_count: number;
  progress_chart: ITeamspaceProgressChartRow[];
  group_by?: TTeamspaceOverviewGroupBy;
}

export interface ITeamspaceCycleSummary {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface ITeamspaceCycles {
  active: ITeamspaceCycleSummary[];
  upcoming: ITeamspaceCycleSummary[];
  completed: ITeamspaceCycleSummary[];
}

export interface ITeamspaceOverdueIssue {
  id: string;
  name: string;
  sequence_id: number;
  priority: string | null;
  target_date: string | null;
  project_id: string;
  project_identifier: string;
  state_group: string | null;
}

export interface ITeamspaceOverdueIssues {
  results: ITeamspaceOverdueIssue[];
}

export type TTeamspaceRelationDirection = "blocking" | "blocked";

export interface ITeamspaceRelation {
  id: string;
  issue_id: string;
  issue_name: string;
  related_issue_id: string;
  related_issue_name: string;
}

export interface ITeamspaceRelations {
  results: ITeamspaceRelation[];
  direction: TTeamspaceRelationDirection;
}

export type TTeamspaceStatsGroupBy = "project" | "member" | "state_group" | "dependency" | "due_by";

// The backend returns different row shapes depending on `group_by` (e.g.
// `project_id`/`project__name` vs `assignees__id`/`assignees__display_name`
// vs `state__group` vs `dependency` vs `due_by`), always alongside `count`.
export type ITeamspaceStatsRow = Record<string, string | number | null> & { count: number };

export interface ITeamspaceStats {
  group_by: TTeamspaceStatsGroupBy;
  results: ITeamspaceStatsRow[];
}

// Category 13, feature 3 (spec section 3) - Teamspace-scoped Pages/Views.
// Mirrors `TeamspacePageSerializer`/`TeamspaceViewSerializer` fields
// (apps/api/plane/app/serializers/teamspace.py) - deliberately a plain,
// minimal shape rather than the full project `TPage`/`IProjectView`
// types, since the teamspace list/detail surfaces only need enough to
// render a simple list and link out (see detail/pages-tab.tsx,
// detail/views-tab.tsx).
export interface ITeamspacePage {
  id: string;
  name: string;
  owned_by: string;
  access: number;
  teamspace: string;
  workspace: string;
  logo_props: TLogoProps;
  is_locked: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export type TTeamspacePageWritePayload = Partial<Pick<ITeamspacePage, "name" | "logo_props" | "access">>;

export interface ITeamspaceView {
  id: string;
  name: string;
  description: string;
  teamspace: string;
  query: Record<string, unknown>;
  filters: Record<string, unknown>;
  display_filters: Record<string, unknown>;
  display_properties: Record<string, unknown>;
  access: number;
  sort_order: number;
  logo_props: TLogoProps;
  owned_by: string;
  is_locked: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TTeamspaceViewWritePayload = Partial<
  Pick<
    ITeamspaceView,
    "name" | "description" | "logo_props" | "filters" | "display_filters" | "display_properties" | "access"
  >
>;
