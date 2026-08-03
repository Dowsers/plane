/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkItemFilterExpression } from "./view-props";

/**
 * Natural-language filter assistant - see
 * docs/feature-specs/04-views-filters.md ("Assistant de filtre en langage
 * naturel") in plane-selfhost. Mirrors the deterministic, rule-based (no
 * LLM call) parser in `apps/api/plane/utils/nl_filter_parser.py` and the
 * endpoints in `apps/api/plane/app/views/view/nl_filter_assistant.py`.
 */
export type TNLFilterAssistantStatus = "success" | "partial" | "failed";

export type TNLFilterAssistantRequest = {
  query: string;
  /** IANA timezone name (e.g. "Europe/Paris") - relative dates ("today",
   * "this week") are resolved server-side in this timezone. Falls back to
   * the user's stored `user_timezone` if omitted. */
  timezone?: string;
};

/**
 * Response of `POST .../ai-filter-assistant/` (project- or
 * workspace-scoped). `filters` is exactly the same `{"and": [...]}`
 * `rich_filters` wire format already used by saved views and the advanced
 * filter builder - no new filter format, directly consumable by
 * `workItemFiltersAdapter.toInternal`.
 */
export type TNLFilterAssistantResponse = {
  status: TNLFilterAssistantStatus;
  filters: TWorkItemFilterExpression;
  restatement: string;
  unresolved_terms: string[];
  query_id: string;
};

/**
 * One row of `GET .../ai-filter-assistant/recent/` - mirrors
 * `NaturalLanguageFilterQuerySerializer`
 * (apps/api/plane/app/serializers/view.py), read-only.
 */
export type TNLFilterAssistantRecentQuery = {
  id: string;
  workspace: string;
  project: string | null;
  raw_query: string;
  detected_language: string;
  resolved_filters: TWorkItemFilterExpression;
  restatement: string;
  unresolved_terms: string[];
  status: TNLFilterAssistantStatus;
  latency_ms: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};
