/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export interface ITeam {
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

export type TTeamWritePayload = Partial<Pick<ITeam, "name" | "description" | "logo_props">>;

export interface ITeamMember {
  id: string;
  team: string;
  member: string;
  member_email: string;
  member_display_name: string;
  member_avatar: string;
  role: number;
  created_at: string;
  updated_at: string;
}

export type TTeamMemberWritePayload = Pick<ITeamMember, "member" | "role">;

export interface ITeamProject {
  id: string;
  team: string;
  project: string;
  project_name: string;
  project_identifier: string;
  created_at: string;
  updated_at: string;
}

export type TTeamProjectWritePayload = Pick<ITeamProject, "project">;

export interface ITeamDetail extends ITeam {
  members: ITeamMember[];
  projects: ITeamProject[];
}
