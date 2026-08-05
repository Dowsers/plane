/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Types for recurring issue templates - see
// docs/feature-specs/06-automation-workflow-sla.md ("Work items
// récurrents", section 3) in plane-selfhost, and the backend half of this
// feature: apps/api/plane/app/views/recurring_issue_template/base.py,
// apps/api/plane/app/serializers/recurring_issue_template.py,
// apps/api/plane/bgtasks/recurring_issue_task.py. Deliberately a standalone
// type family (not folded into `TIssue`) since a template is not an issue -
// it only ever produces one.

import type { TIssuePriorities } from "./issues";

export type TRecurringIssueFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type TRecurringIssueTemplate = {
  id: string;
  workspace: string;
  project: string;
  /** May contain a `{{date}}` token (e.g. "Weekly standup — {{date}}"),
   * resolved to `YYYY-MM-DD` at generation time. */
  name: string;
  description: string;
  description_html: string;
  priority: TIssuePriorities;
  state_id: string | null;
  estimate_point_id: string | null;
  /** `null` for a not-yet-configured draft (e.g. straight out of
   * `convert-to-recurring`) - such a draft can't be made `is_active: true`
   * until this (and `start_date`) are set. */
  frequency: TRecurringIssueFrequency | null;
  interval: number;
  /** Only meaningful when `frequency` is `WEEKLY`. Python `date.weekday()`
   * convention: 0 = Monday ... 6 = Sunday (NOT ISO's 1 = Monday). */
  weekdays: number[];
  /** Only meaningful for `MONTHLY`/`YEARLY`. 29/30/31 clamp to the actual
   * last day of a shorter target month at generation time. */
  day_of_month: number | null;
  /** Only meaningful for `YEARLY`. 1-12. */
  month_of_year: number | null;
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  max_occurrences: number | null;
  occurrences_generated: number;
  next_run_at: string | null;
  is_active: boolean;
  label_ids: string[];
  assignee_ids: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/** Any subset of the writable fields - matches the backend's own
 * `read_only_fields` (everything except `id`/`workspace`/`project`/
 * `occurrences_generated`/`next_run_at`/`created_at`/`updated_at`/
 * `created_by`). Note the backend only ever persists `description_html`
 * from user input - its own plain-text `description` is server-derived. */
export type TRecurringIssueTemplatePayload = Partial<
  Pick<
    TRecurringIssueTemplate,
    | "name"
    | "description_html"
    | "priority"
    | "state_id"
    | "estimate_point_id"
    | "frequency"
    | "interval"
    | "weekdays"
    | "day_of_month"
    | "month_of_year"
    | "timezone"
    | "start_date"
    | "end_date"
    | "max_occurrences"
    | "is_active"
    | "label_ids"
    | "assignee_ids"
  >
>;

export type TRecurringIssueTemplateListParams = {
  cursor?: string;
  per_page?: number;
};

/** Mirrors the backend's `IssueFlatSerializer` shape exactly - the shape
 * returned by both `generate-now` (a single object) and `generated-issues`
 * (a paginated list of these). Deliberately not `TIssue` - the backend
 * never returns the full issue payload from these two endpoints. */
export type TRecurringGeneratedIssue = {
  id: string;
  name: string;
  description_json: object | null;
  description_html: string;
  priority: TIssuePriorities;
  start_date: string | null;
  target_date: string | null;
  sequence_id: number;
  sort_order: number;
  is_draft: boolean;
};
