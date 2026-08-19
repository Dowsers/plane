/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueTriageSuggestion,
  TIssueTriageSuggestionField,
  TIssueTriageSuggestionRegenerateResponse,
  TIssueTriageSuggestionResolveResponse,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9, feature 1 - "AI-assisted auto-triage"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Backend:
 * `IssueTriageSuggestionEndpoint`/`IssueTriageSuggestionRegenerateEndpoint`/
 * `IssueTriageSuggestionResolveEndpoint`
 * (apps/api/plane/app/views/issue_triage_suggestion.py).
 *
 * `getSuggestion` treats a 404 as "no suggestion generated for this issue
 * yet" rather than an error - same `validateStatus` convention as
 * `IssueCommentSummaryService.getSummary` (AI triage disabled, or the
 * project had too few historical issues, both surface as a 404 here, and
 * both are "nothing to show", not error states).
 *
 * `regenerateSuggestion`/`resolveSuggestion` attach the HTTP status onto
 * the thrown error (same convention as `ProjectUpdateService.generateDraft`)
 * so callers can special-case 429 (rate-limited regenerate) or 400
 * (terminal-state issue, or an already-`EXPIRED` suggestion) without
 * parsing message text. Regenerate is fully async (202) - the actual
 * regenerated suggestion only ever arrives via a subsequent `getSuggestion`
 * call, there is no synchronous result.
 */
export class IssueTriageSuggestionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSuggestion(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TIssueTriageSuggestion | null> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/ai-triage-suggestion/`,
      {},
      { validateStatus: (status: number) => status === 200 || status === 404 }
    ).then((response) => (response.status === 404 ? null : response.data));
  }

  async regenerateSuggestion(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TIssueTriageSuggestionRegenerateResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/ai-triage-suggestion/regenerate/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }

  async resolveSuggestion(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    action: "accept" | "reject",
    fields: TIssueTriageSuggestionField[]
  ): Promise<TIssueTriageSuggestionResolveResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/ai-triage-suggestion/resolve/`,
      { action, fields }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }
}
