/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export type TInitiativeStatus = "PROPOSED" | "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELED";

export type TInitiativeHealth = "on-track" | "at-risk" | "off-track";

export interface IInitiative {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  description_html: string;
  status: TInitiativeStatus;
  lead_id: string | null;
  start_date: string | null;
  target_date: string | null;
  health: TInitiativeHealth | null;
  logo_props: TLogoProps;
  sort_order: number;
  external_id: string | null;
  external_source: string | null;
  total_issues: number;
  completed_issues: number;
  total_projects: number;
  project_ids: string[];
  progress: number | null;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export type TInitiativeWritePayload = Partial<
  Pick<
    IInitiative,
    | "name"
    | "description"
    | "description_html"
    | "status"
    | "lead_id"
    | "start_date"
    | "target_date"
    | "logo_props"
    | "sort_order"
    | "external_id"
    | "external_source"
  >
>;

export interface IInitiativeProject {
  id: string;
  initiative_id: string;
  project_id: string;
  project_detail: {
    id: string;
    name: string;
    identifier: string;
    logo_props: TLogoProps;
  };
  sort_order: number;
  total_issues: number;
  completed_issues: number;
  created_at: string;
}

export interface IInitiativeActivity {
  id: string;
  initiative_id: string;
  actor: string | null;
  actor_detail: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    avatar_url: string;
  } | null;
  verb: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string;
  created_at: string;
}
