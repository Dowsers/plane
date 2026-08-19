/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// plane imports
import type { TIssue } from "@plane/types";
// services
import { IssueService } from "@/services/issue/issue.service";

const issueService = new IssueService();

export type TDuplicateCandidateRef = {
  issue_id: string;
  project_id: string;
};

/**
 * Category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Neither the
 * live draft-check result (`TIssueDuplicateCheckResult`) nor the persisted
 * suggestion (`TIssueDuplicateSuggestion`) carries `sequence_id` - both
 * only have a real `issue_id` (uuid), and `generateWorkItemLink` needs a
 * project identifier + sequence id to build a real work item URL. Same
 * problem, same solution, as the sibling category 9 feature's own
 * `SimilarIssuesPopover`
 * (apps/web/core/components/issues/issue-detail/ai-triage/similar-issues-popover.tsx):
 * fetch the small set of full issues via `IssueService.retrieveIssues`
 * rather than assuming they're already loaded in `issueMap` (candidates
 * are very likely NOT already loaded - they can come from a project the
 * current view isn't even open in, when the workspace-wide scope is on).
 *
 * Candidates are grouped by `project_id` since `retrieveIssues` is a
 * single-project batch call - in the common (default) PROJECT-scoped case
 * this is exactly one request; only the WORKSPACE scope can ever produce
 * more than one.
 */
export function useDuplicateIssueLinks(workspaceSlug: string | undefined, candidates: TDuplicateCandidateRef[]) {
  // Not resorted before joining - every current caller passes candidates
  // in an already-deterministic order (a single candidate per card), so
  // there's nothing to gain from sorting beyond SWR cache-key stability,
  // and avoiding `Array#sort()`'s mutation footprint (`Array#toSorted()`
  // isn't available - this app's own `lib` target, `@plane/typescript-config/react-router.json`,
  // stops at ES2022) isn't worth a manual, allocation-heavy sort here.
  const candidatesKey = candidates.map((candidate) => `${candidate.project_id}:${candidate.issue_id}`).join(",");
  const swrKey =
    workspaceSlug && candidates.length > 0 ? `duplicate-issue-links-${workspaceSlug}-${candidatesKey}` : null;

  const { data, isLoading } = useSWR(swrKey, async () => {
    const issueIdsByProject = new Map<string, string[]>();
    candidates.forEach(({ issue_id, project_id }) => {
      const existing = issueIdsByProject.get(project_id) ?? [];
      existing.push(issue_id);
      issueIdsByProject.set(project_id, existing);
    });

    const groupedResults = await Promise.all(
      Array.from(issueIdsByProject.entries()).map(([projectId, issueIds]) =>
        issueService.retrieveIssues(workspaceSlug as string, projectId, issueIds).catch(() => [] as TIssue[])
      )
    );

    const issuesById: Record<string, TIssue> = {};
    groupedResults.flat().forEach((issue) => {
      issuesById[issue.id] = issue;
    });
    return issuesById;
  });

  return { issuesById: data ?? {}, isLoading };
}
