/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TRoadmapColorBy, TRoadmapProject } from "@plane/types";

const PRIORITY_COLOR_VARS: Record<TRoadmapProject["priority"], string> = {
  urgent: "var(--priority-urgent)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
  none: "var(--priority-none)",
};

const HEALTH_COLOR_VARS: Record<string, string> = {
  "on-track": "var(--text-color-success-primary)",
  "at-risk": "var(--text-color-warning-primary)",
  "off-track": "var(--text-color-danger-primary)",
};

const NO_HEALTH_COLOR = "var(--text-color-tertiary)";

export const getRoadmapProjectColor = (project: TRoadmapProject | undefined, colorBy: TRoadmapColorBy): string => {
  if (!project) return NO_HEALTH_COLOR;
  if (colorBy === "health") return (project.health && HEALTH_COLOR_VARS[project.health]) || NO_HEALTH_COLOR;
  return PRIORITY_COLOR_VARS[project.priority] ?? PRIORITY_COLOR_VARS.none;
};
