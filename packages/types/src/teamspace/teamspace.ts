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
