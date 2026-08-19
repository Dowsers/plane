/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { TIssueDuplicateCheckResult } from "@plane/types";
import { ControlLink } from "@plane/ui";
import { generateWorkItemLink } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { HighlightedExcerpt } from "@/components/issues/duplicate-detection/highlighted-excerpt";
import { useDuplicateIssueLinks } from "@/components/issues/duplicate-detection/use-duplicate-issue-links";

type Props = {
  workspaceSlug: string;
  result: TIssueDuplicateCheckResult;
};

/** One candidate card in the creation modal's "Tickets similaires
 * detectes" banner - title, project, state, similarity %, and the
 * highlighted excerpt (exigence 4), linking directly to the candidate
 * issue's peek overview (this fork's own established "open an issue from
 * elsewhere" convention, same as `SimilarIssuesPopover`, category 9
 * feature 1). Purely advisory - clicking away or submitting the form
 * regardless is always possible, this card has no destructive/blocking
 * action of its own. */
export const DuplicateCheckCard = observer(function DuplicateCheckCard(props: Props) {
  const { workspaceSlug, result } = props;
  const { getProjectById, getProjectIdentifierById } = useProject();
  const { getStateById } = useProjectState();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();
  const { issuesById } = useDuplicateIssueLinks(workspaceSlug, [
    { issue_id: result.issue_id, project_id: result.project_id },
  ]);

  const projectDetails = getProjectById(result.project_id);
  const stateDetails = result.state_id ? getStateById(result.state_id) : undefined;
  const candidateIssue = issuesById[result.issue_id];
  const projectIdentifier = getProjectIdentifierById(result.project_id);

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: result.project_id,
    issueId: result.issue_id,
    projectIdentifier,
    sequenceId: candidateIssue?.sequence_id,
  });

  return (
    <ControlLink
      href={workItemLink}
      onClick={() => candidateIssue && handleRedirection(workspaceSlug, candidateIssue, isMobile)}
      className="block rounded-md border border-subtle bg-surface-1 p-2.5 hover:border-strong"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-13 font-medium text-primary">{result.name}</span>
        <span className="shrink-0 rounded-full bg-accent-primary/10 px-1.5 py-0.5 text-11 font-medium text-accent-primary">
          {Math.round(result.similarity_score * 100)}%
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-12 text-tertiary">
        {projectDetails && <span className="truncate">{projectDetails.name}</span>}
        {stateDetails && (
          <span className="flex items-center gap-1">
            {projectDetails && <span aria-hidden="true">&middot;</span>}
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: stateDetails.color }} />
            {stateDetails.name}
          </span>
        )}
      </div>
      {result.explanation?.excerpt_candidate && (
        <p className="mt-1.5 line-clamp-2 text-12 text-secondary">
          <HighlightedExcerpt
            text={result.explanation.excerpt_candidate}
            terms={result.explanation.highlighted_terms}
          />
        </p>
      )}
    </ControlLink>
  );
});
