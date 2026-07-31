/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export interface IProjectTemplateListItem {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  logo_props: TLogoProps;
  network: number;
  linked_initiative: string | null;
  add_creator_as_lead: boolean;
  usage_count: number;
  total_states: number;
  total_labels: number;
  total_issues: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface IProjectTemplateState {
  id: string;
  name: string;
  color: string;
  group: string;
  sequence: number;
  default: boolean;
}

export interface IProjectTemplateLabel {
  id: string;
  parent: string | null;
  name: string;
  color: string;
  sort_order: number;
}

export interface IProjectTemplateMember {
  id: string;
  member: string;
  role: number;
}

export interface IProjectTemplateIssue {
  id: string;
  name: string;
  description_html: string;
  priority: string;
  state: string | null;
  parent: string | null;
  label_ids: string[];
  assignee_ids: string[];
  sort_order: number;
  target_date_offset_days: number | null;
}

export interface IProjectTemplate extends IProjectTemplateListItem {
  states: IProjectTemplateState[];
  labels: IProjectTemplateLabel[];
  members: IProjectTemplateMember[];
  issues: IProjectTemplateIssue[];
}

export type TCreateProjectTemplateFromProjectPayload = {
  source_project_id: string;
  name: string;
  description?: string;
  include_current_work_items?: boolean;
};

export type TCreateProjectFromTemplatePayload = {
  name: string;
  identifier: string;
  network?: number;
  description?: string;
  logo_props?: TLogoProps;
  linked_initiative?: string | null;
};
