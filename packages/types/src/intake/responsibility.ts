/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TIntakeAssignmentMode = "fixed_owner" | "round_robin";

export type TIntakeResponsibilitySetting = {
  id: string | null;
  workspace_id: string | null;
  project_id: string;
  is_enabled: boolean;
  assignment_mode: TIntakeAssignmentMode;
  fixed_owner: string | null;
  escalation_timeout_minutes: number;
};

export type TIntakeRotationMember = {
  id: string;
  member: string;
  member_detail: {
    id: string;
    display_name: string;
    avatar_url?: string;
    first_name?: string;
    last_name?: string;
  };
  sort_order: number;
  is_active: boolean;
};
