/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueDuplicateCheckPayload,
  TIssueDuplicateCheckResponse,
  TIssueDuplicateConfirmPayload,
  TIssueDuplicateConfirmResponse,
  TIssueDuplicateSuggestion,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Service for category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Backend:
 * `IssueDuplicateCheckEndpoint`/`IssueDuplicateSuggestionListEndpoint`/
 * `IssueDuplicateSuggestionDismissEndpoint`/
 * `IssueDuplicateSuggestionConfirmEndpoint`
 * (apps/api/plane/app/views/issue_duplicate_suggestion.py).
 *
 * `checkDraft` never throws - the endpoint itself always returns 200 with
 * `{ results: [] }` on any failure (feature disabled, embedding provider
 * down, exigence 12), so there is nothing meaningful to catch beyond a
 * genuine network error, which is left to bubble up like any other call
 * (same as `IssueTriageSuggestionService.getSuggestion`'s own reasoning for
 * its own "nothing to show" cases).
 *
 * `dismiss`/`confirm` attach the HTTP status onto the thrown error (same
 * convention as `IssueTriageSuggestionService.resolveSuggestion`) so
 * callers can special-case a 400 (suggestion already resolved by someone
 * else in the meantime - genuinely possible since multiple project
 * members can see the same pending suggestion at once).
 */
export class IssueDuplicateSuggestionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async checkDraft(
    workspaceSlug: string,
    projectId: string,
    data: TIssueDuplicateCheckPayload
  ): Promise<TIssueDuplicateCheckResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/duplicate-check/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueDuplicateSuggestion[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/duplicate-suggestions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async dismiss(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    suggestionId: string
  ): Promise<TIssueDuplicateSuggestion> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/duplicate-suggestions/${suggestionId}/dismiss/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }

  async confirm(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    suggestionId: string,
    data: TIssueDuplicateConfirmPayload
  ): Promise<TIssueDuplicateConfirmResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/duplicate-suggestions/${suggestionId}/confirm/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw { ...error?.response?.data, status: error?.response?.status };
      });
  }
}
