/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";
import type { TInitiativeHealth } from "../initiative";
import type { TIssuePriorities } from "../issues";

// Lightweight, read-only shape returned by GET workspaces/<slug>/roadmap/projects/ -
// intentionally not the full IProject, see
// docs/feature-specs/03-projects-roadmaps-initiatives.md ("Roadmap/Timeline
// cross-projet") in plane-selfhost.
export interface TRoadmapProject {
  id: string;
  name: string;
  identifier: string;
  logo_props: TLogoProps;
  network: number;
  start_date: string | null;
  target_date: string | null;
  priority: TIssuePriorities;
  health: TInitiativeHealth | null;
  project_lead: string | null;
  sort_order: number | null;
  member_role: number | null;
}

export type TRoadmapColorBy = "priority" | "health";
