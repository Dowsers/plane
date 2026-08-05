/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Types for the workspace-level SLA policy engine - see
// docs/feature-specs/06-automation-workflow-sla.md ("Politiques de SLA",
// section 2) in plane-selfhost, and the backend half of this feature:
// apps/api/plane/app/views/sla/{base,issue,report}.py,
// apps/api/plane/app/serializers/sla.py, apps/api/plane/db/models/sla.py,
// apps/api/plane/utils/sla_engine.py. Unlike the sibling `TWorkflowRule*`
// (workflow-rule.ts) and `TRecurringIssueTemplate*` types, `TSLAPolicy` is
// WORKSPACE-scoped, not project-scoped - there is no `project_id` on the
// policy itself, only an optional `project_ids`/`applies_to_all_projects`
// scoping pair.

import type { TIssuePriorities } from "./issues";

/** Mirrors `StateGroup` (apps/api/plane/db/models/state.py) exactly -
 * deliberately NOT reusing this fork's own frontend `TStateGroups`
 * (./state.ts), which only covers 5 of these 6 values (no `"triage"` -
 * that fork's frontend treats Triage purely as an intake-flow concept, not
 * one of its 5 state-group colors), even though the backend's own
 * `state_group_filter` validation on `SLAPolicy` accepts all 6. */
export type TSLAStateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled" | "triage";

export type TSLAType = "response" | "resolution";

export type TSLAStatus = "on_track" | "at_risk" | "breached" | "achieved" | "cancelled" | "paused";

export type TSLAPolicy = {
  id: string;
  workspace: string;
  name: string;
  description: string;
  project_ids: string[];
  applies_to_all_projects: boolean;
  priority_filter: TIssuePriorities[];
  label_ids: string[];
  assignee_ids: string[];
  state_group_filter: TSLAStateGroup[];
  response_time_minutes: number | null;
  resolution_time_minutes: number | null;
  warning_threshold_percent: number;
  critical_threshold_percent: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/** Everything writable through `SLAPolicyViewSet.create`/`partial_update`
 * (apps/api/plane/app/views/sla/base.py). Note `project_ids`/`label_ids`/
 * `assignee_ids` ARE writable here despite being marked read-only on
 * `SLAPolicySerializer`'s own output shape - the view reads them straight
 * off `request.data` and reconciles the underlying M2M fields directly
 * (see that file's module docstring), it never calls
 * `serializer.save()` with them. */
export type TSLAPolicyPayload = Partial<
  Pick<
    TSLAPolicy,
    | "name"
    | "description"
    | "project_ids"
    | "applies_to_all_projects"
    | "priority_filter"
    | "label_ids"
    | "assignee_ids"
    | "state_group_filter"
    | "response_time_minutes"
    | "resolution_time_minutes"
    | "warning_threshold_percent"
    | "critical_threshold_percent"
    | "is_active"
    | "sort_order"
  >
>;

/** One row per issue per active delay type (response/resolution) - see
 * `IssueSLASerializer`. Entirely read-only on the API. */
export type TIssueSLA = {
  id: string;
  issue: string;
  project: string;
  sla_policy: string | null;
  sla_policy_name: string | null;
  sla_type: TSLAType;
  due_at: string;
  met_at: string | null;
  status: TSLAStatus;
  breached_at: string | null;
  last_notified_status: string | null;
  created_at: string;
  updated_at: string;
};

export type TSLAReportSummary = Record<TSLAStatus, number>;

export type TSLAReportRow = {
  id: string;
  issue_id: string | null;
  issue_identifier: string | null;
  issue_name: string | null;
  project_id: string | null;
  project_name: string | null;
  sla_policy_id: string | null;
  sla_policy_name: string | null;
  sla_type: TSLAType;
  status: TSLAStatus;
  due_at: string;
  met_at: string | null;
  breached_at: string | null;
};

export type TSLAReportResponse = {
  summary: TSLAReportSummary;
  total: number;
  /** Capped at 500 rows server-side (`MAX_JSON_DETAIL_ROWS` in
   * apps/api/plane/app/views/sla/report.py) regardless of `total` - use
   * the CSV export for the full set. */
  results: TSLAReportRow[];
  results_truncated: boolean;
};

export type TSLAReportParams = {
  project_id?: string;
  policy_id?: string;
  assignee_id?: string;
  date_from?: string;
  date_to?: string;
};
