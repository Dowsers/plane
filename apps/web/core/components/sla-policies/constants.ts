/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EPillVariant } from "@plane/propel/pill";
import type { TIssuePriorities, TSLAStateGroup, TSLAStatus, TSLAType } from "@plane/types";

export const SLA_PRIORITY_OPTIONS: { value: TIssuePriorities; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" },
];

export const SLA_PRIORITY_LABELS: Record<TIssuePriorities, string> = Object.fromEntries(
  SLA_PRIORITY_OPTIONS.map((option) => [option.value, option.label])
) as Record<TIssuePriorities, string>;

/**
 * Mirrors `StateGroup` (apps/api/plane/db/models/state.py) exactly - a
 * deliberately SLA-feature-local list rather than reusing this fork's
 * shared `STATE_GROUPS` (packages/constants/src/state.ts), which only
 * covers 5 of these 6 values. It has no `"triage"` entry at all (Triage is
 * treated purely as an intake-flow concept in this fork's frontend, not
 * one of the 5 state-group colors), even though the backend's own
 * `state_group_filter` validation on `SLAPolicy` accepts it as a 6th
 * value. No dedicated "state group" picker component exists anywhere else
 * in this codebase (confirmed by direct search) - this feature reuses the
 * generic `DashboardGenericMultiSelect` (built for Category 5's custom
 * dashboards `table` widget filters) fed by this options list, rather than
 * building a bespoke dropdown from scratch.
 */
export const SLA_STATE_GROUP_OPTIONS: { value: TSLAStateGroup; label: string; color: string }[] = [
  { value: "backlog", label: "Backlog", color: "#d9d9d9" },
  { value: "unstarted", label: "Unstarted", color: "#3f76ff" },
  { value: "started", label: "Started", color: "#f59e0b" },
  { value: "completed", label: "Completed", color: "#16a34a" },
  { value: "cancelled", label: "Canceled", color: "#dc2626" },
  { value: "triage", label: "Triage", color: "#6b7280" },
];

export const SLA_STATE_GROUP_LABELS: Record<TSLAStateGroup, string> = Object.fromEntries(
  SLA_STATE_GROUP_OPTIONS.map((option) => [option.value, option.label])
) as Record<TSLAStateGroup, string>;

export const SLA_TYPE_LABELS: Record<TSLAType, string> = {
  response: "Response",
  resolution: "Resolution",
};

export const SLA_STATUS_LABELS: Record<TSLAStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  breached: "Breached",
  achieved: "Achieved",
  cancelled: "Cancelled",
  paused: "Paused",
};

/** Suggested mapping from the feature brief - `paused` is defined on the
 * backend model for forward-compat only (this fork has no "on hold"
 * `StateGroup`, so `plane.utils.sla_engine` never actually produces it in
 * v1), kept here anyway so the UI doesn't break if that ever changes. */
export const SLA_STATUS_PILL_VARIANT: Record<TSLAStatus, EPillVariant> = {
  on_track: EPillVariant.DEFAULT,
  at_risk: EPillVariant.WARNING,
  breached: EPillVariant.ERROR,
  achieved: EPillVariant.SUCCESS,
  cancelled: EPillVariant.DEFAULT,
  paused: EPillVariant.DEFAULT,
};

export const SLA_STATUS_OPTIONS: { value: TSLAStatus; label: string }[] = (
  Object.keys(SLA_STATUS_LABELS) as TSLAStatus[]
).map((value) => ({ value, label: SLA_STATUS_LABELS[value] }));

export const DEFAULT_WARNING_THRESHOLD_PERCENT = 75;
export const DEFAULT_CRITICAL_THRESHOLD_PERCENT = 90;

/** Verbatim copies of the error strings returned by
 * `_validate_policy_values` in apps/api/plane/app/views/sla/base.py -
 * checked client-side for immediate feedback, and rendered verbatim if the
 * API ever returns one of these anyway (that view returns
 * `{"error": "<message>"}` on failure, not DRF's usual per-field shape). */
export const ERROR_NAME_REQUIRED = "Name is required";
export const ERROR_NO_TIME_BUDGET = "At least one of response_time_minutes or resolution_time_minutes is required";
export const ERROR_THRESHOLD_ORDER = "critical_threshold_percent must be greater than warning_threshold_percent";

/** Human-readable minutes formatter (e.g. `240` -> `"4h"`, `90` ->
 * `"1h 30m"`, `1440` -> `"1d"`). Returns an em dash for null/unset/zero,
 * since `response_time_minutes`/`resolution_time_minutes` are both
 * optional on `SLAPolicy` (only at least one is required). */
export const formatSLAMinutes = (minutes: number | null | undefined): string => {
  if (!minutes || minutes <= 0) return "—";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.round(minutes % 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return parts.length > 0 ? parts.join(" ") : "0m";
};
