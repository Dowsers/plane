/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TProjectUpdateStatus = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";

export type TProjectUpdateGeneratedSummary = {
  since: string;
  issues_created: number;
  issues_completed: number;
  issues_cancelled: number;
  net_backlog_change: number;
  cycles_started: number;
  cycles_closed: number;
};

export interface IProjectUpdate {
  id: string;
  workspace_id: string;
  project_id: string;
  status: TProjectUpdateStatus;
  description_html: string;
  generated_summary_json: TProjectUpdateGeneratedSummary | Record<string, never>;
  is_summary_edited: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  created_by_detail?: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    avatar_url: string;
  };
}

export type TProjectUpdateWritePayload = {
  status: TProjectUpdateStatus;
  description_html: string;
  generated_summary_json?: TProjectUpdateGeneratedSummary | Record<string, never>;
  is_summary_edited?: boolean;
};

export type TProjectUpdateCadence = "DISABLED" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
