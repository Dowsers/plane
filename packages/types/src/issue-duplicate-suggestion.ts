/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Mirrors
 * `IssueDuplicateSuggestionSerializer`
 * (apps/api/plane/app/serializers/issue_duplicate_suggestion.py) and the
 * plain-dict shape `check_draft_for_duplicates` returns
 * (apps/api/plane/utils/issue_duplicate_detection.py).
 *
 * Deliberately NOT reusing the pre-existing, always-empty CE "de-dupe"
 * scaffold (`packages/types/src/de-dupe.ts`'s `TDeDupeIssue`/
 * `TDuplicateIssuePayload`/`TDuplicateIssueResponse`) - that shape belongs
 * to a different, never-implemented upstream Commercial mechanism (a full
 * Issue-like candidate object with no similarity score or "why"
 * explanation at all) and its only two real consumers
 * (`apps/web/ce/hooks/use-debounced-duplicate-issues.tsx`,
 * `apps/web/ce/components/de-dupe/*`) are pure no-ops. Building a parallel,
 * purpose-shaped type here avoids forcing this feature's richer data
 * (similarity_score, explanation with highlighted terms) through a shape
 * that has no room for it.
 */

/** Shared "why" shape - identical on both the live draft-check result and
 * a persisted `IssueDuplicateSuggestion` (same `build_duplicate_explanation`
 * output, see that function's own docstring for the algorithmic, non-LLM
 * generation). */
export type TIssueDuplicateExplanation = {
  excerpt_source: string;
  excerpt_candidate: string;
  excerpt_similarity: number;
  highlighted_terms: string[];
};

/** One candidate from `POST .../issues/duplicate-check/` - a plain dict,
 * not a persisted row (the source issue doesn't exist yet as a draft), so
 * there is no `id`/`status`/resolve actions here. */
export type TIssueDuplicateCheckResult = {
  issue_id: string;
  project_id: string;
  name: string;
  state_id: string | null;
  /** Cosine similarity in [0, 1]. */
  similarity_score: number;
  explanation: TIssueDuplicateExplanation;
};

export type TIssueDuplicateCheckPayload = {
  title: string;
  description?: string;
};

/** Always 200 with `{ results: [] }` on any failure (feature disabled,
 * embedding provider down) - exigence 12, never surfaces as an error to the
 * caller. See `IssueDuplicateCheckEndpoint`'s own docstring. */
export type TIssueDuplicateCheckResponse = {
  results: TIssueDuplicateCheckResult[];
};

/** Matches `IssueDuplicateSuggestionStatus`
 * (apps/api/plane/db/models/issue_duplicate_suggestion.py) verbatim -
 * lowercase, unlike `TIssueTriageSuggestionStatus`'s uppercase convention.
 * `stale` and `dismissed` are both excluded from the default pending list
 * the frontend renders - see that model's own docstring for why they are
 * two deliberately distinct mechanisms, not the same thing under two
 * names. */
export type TIssueDuplicateSuggestionStatus =
  | "pending"
  | "dismissed"
  | "confirmed_duplicate"
  | "confirmed_related"
  | "stale";

/** Response shape of `GET .../issues/:issueId/duplicate-suggestions/`
 * (list, `pending` only) and of the `dismiss`/`confirm` action responses'
 * own `suggestion` field. The three `suggested_issue_*` fields are
 * denormalized directly onto the row (see the serializer's own docstring)
 * specifically so a suggestion card can render title/project/state without
 * a second round-trip per candidate - `sequence_id` is NOT included, a
 * consuming component still needs one extra fetch to build a real work
 * item link (see `IssueService.retrieveIssues`). */
export type TIssueDuplicateSuggestion = {
  id: string;
  workspace: string;
  project: string;
  issue: string;
  suggested_issue: string;
  similarity_score: number;
  status: TIssueDuplicateSuggestionStatus;
  explanation: TIssueDuplicateExplanation;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  suggested_issue_name: string | null;
  suggested_issue_project_id: string | null;
  suggested_issue_state_id: string | null;
};

/** Body for `POST .../duplicate-suggestions/:suggestionId/confirm/` -
 * mutually exclusive, terminal per suggestion (exigence 5). */
export type TIssueDuplicateConfirmRelationType = "duplicate" | "relates_to";

export type TIssueDuplicateConfirmPayload = {
  relation_type: TIssueDuplicateConfirmRelationType;
};

export type TIssueDuplicateConfirmResponse = {
  suggestion: TIssueDuplicateSuggestion;
  relation_id: string;
};
