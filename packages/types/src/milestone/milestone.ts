/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export interface IMilestone {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description: string;
  target_date: string | null;
  sort_order: number;
  external_id: string | null;
  external_source: string | null;
  total_issues: number;
  completed_issues: number;
  cancelled_issues: number;
  completion_percentage: number | null;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export type TMilestoneWritePayload = Partial<
  Pick<IMilestone, "name" | "description" | "target_date" | "sort_order" | "external_id" | "external_source">
>;

export interface TMilestoneAvailableIssue {
  id: string;
  name: string;
  sequence_id: number;
}

export interface IMilestoneIssue {
  id: string;
  name: string;
  sequence_id: number;
  state_id: string | null;
  priority: string | null;
  project_id: string;
  assignee_ids: string[];
  start_date: string | null;
  target_date: string | null;
}
