/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
// Work Logs", feature 1, exigence 3) in plane-selfhost - duration is stored
// server-side as raw integer minutes; this formats it client-side into a
// human-readable "2h 30min" shape, mirroring
// plane.bgtasks.issue_activities_task._format_worklog_duration on the
// backend (kept in sync manually - no shared codegen between the two).
export const formatWorklogDuration = (minutes: number): string => {
  if (!minutes || minutes <= 0) return "0min";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}min`;
  if (hours) return `${hours}h`;
  return `${remainder}min`;
};

/** Inverse of formatWorklogDuration's mental model - combines separate
 * hours/minutes form inputs into the single integer-minutes value the API
 * expects. */
export const durationPartsToMinutes = (hours: string, minutes: string): number => {
  const parsedHours = Number(hours) || 0;
  const parsedMinutes = Number(minutes) || 0;
  return Math.round(parsedHours * 60 + parsedMinutes);
};
