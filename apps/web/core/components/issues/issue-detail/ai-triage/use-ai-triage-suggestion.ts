/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// services
import { IssueTriageSuggestionService } from "@/services/issue-triage-suggestion.service";

const issueTriageSuggestionService = new IssueTriageSuggestionService();

/**
 * Shared SWR key builder - `AITriageSuggestionSection` (the "Suggestions
 * IA" card) and `AITriageAppliedBadge` (the small "IA" badge next to an
 * already-resolved Module/Assignees/Labels field) both need the SAME
 * suggestion row. Using one shared hook/key means both read from a single
 * SWR cache entry instead of firing a duplicate `GET` per property row.
 */
export function useAITriageSuggestion(workspaceSlug: string, projectId: string, issueId: string, enabled: boolean) {
  const key = enabled ? `ai-triage-suggestion-${workspaceSlug}-${projectId}-${issueId}` : null;
  const {
    data: suggestion,
    isLoading,
    mutate,
  } = useSWR(key, () => issueTriageSuggestionService.getSuggestion(workspaceSlug, projectId, issueId));

  return { suggestion: suggestion ?? null, isLoading, mutate };
}
