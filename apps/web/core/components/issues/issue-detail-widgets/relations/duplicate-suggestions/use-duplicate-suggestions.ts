/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// services
import { IssueDuplicateSuggestionService } from "@/services/issue-duplicate-suggestion.service";

const issueDuplicateSuggestionService = new IssueDuplicateSuggestionService();

/**
 * Category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Shared SWR
 * key builder for `GET .../issues/:issueId/duplicate-suggestions/`
 * (`pending` only) - same "one hook, one shared cache entry" convention as
 * the sibling category 9 feature's own `useAITriageSuggestion`
 * (apps/web/core/components/issues/issue-detail/ai-triage/use-ai-triage-suggestion.ts).
 * Used by BOTH the "Doublons suggeres" section itself and
 * `IssueDetailWidgetCollapsibles` (which needs to know whether any pending
 * suggestion exists at all, to keep the parent "Relations" collapsible
 * visible even when the issue has zero real `IssueRelation`s yet - see
 * that file's own comment for why).
 */
export function useDuplicateSuggestions(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
  enabled: boolean
) {
  const key =
    enabled && workspaceSlug && projectId && issueId
      ? `issue-duplicate-suggestions-${workspaceSlug}-${projectId}-${issueId}`
      : null;
  const {
    data: suggestions,
    isLoading,
    mutate,
  } = useSWR(key, () =>
    issueDuplicateSuggestionService.list(workspaceSlug as string, projectId as string, issueId as string)
  );

  return { suggestions: suggestions ?? [], isLoading, mutate };
}
