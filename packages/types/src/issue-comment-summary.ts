/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 9, feature 4 - "AI thread summary"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Mirrors
 * `IssueCommentSummarySerializer`
 * (apps/api/plane/app/serializers/issue_comment_summary.py). Note
 * `error_message` is deliberately never a field here - the backend never
 * serializes it back to the client (exigence 9); a `FAILED` status is the
 * only signal the UI ever gets.
 */
export type TIssueCommentSummaryStatus = "PENDING" | "COMPLETED" | "FAILED";

export type TIssueCommentSummaryCitation = {
  marker: number;
  comment_id: string;
  snippet: string;
};

export type TIssueCommentSummary = {
  id: string;
  workspace: string;
  project: string;
  issue: string;
  summary_text: string;
  citations: TIssueCommentSummaryCitation[];
  source_comment_count: number;
  status: TIssueCommentSummaryStatus;
  model_used: string;
  generated_by: string | null;
  generated_at: string | null;
  /** True if comments were added/edited/removed on the issue since this
   * summary was generated - computed server-side from `source_comments_hash`. */
  is_stale: boolean;
  created_at: string;
  updated_at: string;
};
