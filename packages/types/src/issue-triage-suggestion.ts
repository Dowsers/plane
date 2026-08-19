/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 9, feature 1 - "AI-assisted auto-triage"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Mirrors
 * `IssueTriageSuggestionSerializer`
 * (apps/api/plane/app/serializers/issue_triage_suggestion.py).
 *
 * All three suggested-value fields are list-shaped, including
 * `suggested_module_ids` - the backend deliberately rejected the spec's own
 * singular-FK module cardinality (see `IssueTriageSuggestion`'s own model
 * docstring, apps/api/plane/db/models/issue_triage_suggestion.py): `Issue`
 * has no direct module relationship, only the `ModuleIssue` M2M join table,
 * so a suggestion can never be typed as a single nullable FK. The "at most
 * one module suggested" business rule is enforced at the generation LOGIC
 * level only - this type must not assume `suggested_module_ids.length <= 1`
 * for anything beyond display convenience.
 */
export type TIssueTriageSuggestionStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "REJECTED"
  | "AUTO_APPLIED"
  | "EXPIRED";

/** Matches `plane.utils.issue_triage_suggestion.FIELDS` verbatim - the
 * exact vocabulary the `resolve`/`regenerate` endpoints and the
 * `applied_fields`/`rejected_fields`/`expired_fields` bookkeeping arrays
 * use (singular "module", plural "assignees"/"labels"). */
export type TIssueTriageSuggestionField = "module" | "assignees" | "labels";

export type TIssueTriageSuggestion = {
  id: string;
  workspace: string;
  project: string;
  issue: string;
  suggested_module_ids: string[];
  suggested_assignee_ids: string[];
  suggested_label_ids: string[];
  /** `{ id: score }`, score in [0, 1]. */
  confidence_modules: Record<string, number>;
  confidence_assignees: Record<string, number>;
  confidence_labels: Record<string, number>;
  /** Historical issues the similarity search matched against - powers the
   * "Why this suggestion?" explainability UI. Not every entry necessarily
   * contributed a winning candidate for any field. */
  similar_issue_ids: string[];
  status: TIssueTriageSuggestionStatus;
  /** A field's current resolution state is derivable, in this priority
   * order: in `applied_fields` > in `rejected_fields` > in
   * `expired_fields` > still pending (if it has any suggested ids at all)
   * > never suggested (if its suggested ids array is empty). */
  applied_fields: TIssueTriageSuggestionField[];
  rejected_fields: TIssueTriageSuggestionField[];
  expired_fields: TIssueTriageSuggestionField[];
  generated_by_model: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Request body for `POST .../ai-triage-suggestion/resolve/` - partial
 * resolution supported, `fields` need not include all three. */
export type TIssueTriageSuggestionResolvePayload = {
  action: "accept" | "reject";
  fields: TIssueTriageSuggestionField[];
};

export type TIssueTriageSuggestionResolveResponse = {
  suggestion: TIssueTriageSuggestion;
  applied_fields: TIssueTriageSuggestionField[];
  rejected_fields: TIssueTriageSuggestionField[];
  expired_fields: TIssueTriageSuggestionField[];
};

/** `POST .../ai-triage-suggestion/regenerate/` is fully async (202) - the
 * regenerated suggestion itself only ever arrives via a subsequent `GET`,
 * same convention as `IssueCommentSummaryService`'s own generate/poll
 * split. `suggestion` here is just the pre-regeneration snapshot (or
 * `null` if none existed yet), returned purely so the UI has something to
 * show while polling kicks in. */
export type TIssueTriageSuggestionRegenerateResponse = {
  detail: string;
  suggestion: TIssueTriageSuggestion | null;
};
