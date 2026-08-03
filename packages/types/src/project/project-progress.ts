/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Response shape of `GET .../projects/<project_id>/progress/` - the
 * project-level "Scope & velocity" cross-cycle chart. See
 * docs/feature-specs/05-insights-analytics.md, section
 * "1. Graphiques de progression cycle/projet", exigences 7/8.
 */
export type TProjectProgressCycle = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_completed: boolean;
  /** Net scope assigned to the cycle (issues, or points if `estimate_type === "points"`). */
  scope: number;
  started: number;
  completed: number;
};

export type TProjectVelocity = {
  has_enough_data: boolean;
  average_velocity: number | null;
  optimistic_velocity: number | null;
  pessimistic_velocity: number | null;
  window_size: number;
  remaining_work: number;
  projected_completion_date: string | null;
  optimistic_completion_date: string | null;
  pessimistic_completion_date: string | null;
};

export type TProjectProgress = {
  estimate_type: "issues" | "points";
  cycles_enabled: boolean;
  velocity_window_size: number;
  cycles: TProjectProgressCycle[];
  velocity: TProjectVelocity;
};
