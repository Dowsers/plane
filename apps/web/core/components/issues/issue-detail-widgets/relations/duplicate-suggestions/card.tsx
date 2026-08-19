/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueDuplicateConfirmRelationType, TIssueDuplicateSuggestion } from "@plane/types";
import { Button, ControlLink } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// services
import { IssueDuplicateSuggestionService } from "@/services/issue-duplicate-suggestion.service";
// local imports
import { HighlightedExcerpt } from "@/components/issues/duplicate-detection/highlighted-excerpt";
import { useDuplicateIssueLinks } from "@/components/issues/duplicate-detection/use-duplicate-issue-links";

const issueDuplicateSuggestionService = new IssueDuplicateSuggestionService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  suggestion: TIssueDuplicateSuggestion;
  canResolve: boolean;
  onResolved: (suggestionId: string, relationCreated: boolean) => void;
};

/**
 * One row in the "Doublons suggeres" sub-section (exigence 5) - candidate
 * title/state/score/highlighted excerpt, plus the three mutually
 * exclusive, terminal actions ("Ignorer"/"Marquer comme doublon"/"Marquer
 * comme lie"). `suggested_issue_name`/`suggested_issue_state_id` are
 * denormalized straight onto the suggestion row (no extra fetch needed for
 * those), but the work item LINK still needs a `sequence_id`, which isn't
 * denormalized - resolved the same way as the creation modal's own
 * duplicate-check card, via `useDuplicateIssueLinks`.
 */
export const DuplicateSuggestionCard = observer(function DuplicateSuggestionCard(props: Props) {
  const { workspaceSlug, projectId, issueId, suggestion, canResolve, onResolved } = props;
  const { t } = useTranslation();
  const { getProjectIdentifierById } = useProject();
  const { getStateById } = useProjectState();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();

  const [pendingAction, setPendingAction] = useState<"dismiss" | "duplicate" | "relates_to" | null>(null);

  const candidateProjectId = suggestion.suggested_issue_project_id;
  const { issuesById } = useDuplicateIssueLinks(
    workspaceSlug,
    candidateProjectId ? [{ issue_id: suggestion.suggested_issue, project_id: candidateProjectId }] : []
  );
  const candidateIssue = issuesById[suggestion.suggested_issue];
  const stateDetails = suggestion.suggested_issue_state_id
    ? getStateById(suggestion.suggested_issue_state_id)
    : undefined;
  const projectIdentifier = candidateProjectId ? getProjectIdentifierById(candidateProjectId) : undefined;

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: candidateProjectId,
    issueId: suggestion.suggested_issue,
    projectIdentifier,
    sequenceId: candidateIssue?.sequence_id,
  });

  const handleDismiss = async () => {
    setPendingAction("dismiss");
    try {
      await issueDuplicateSuggestionService.dismiss(workspaceSlug, projectId, issueId, suggestion.id);
      onResolved(suggestion.id, false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("issue_duplicate_suggestions.action_error") });
    } finally {
      setPendingAction(null);
    }
  };

  const handleConfirm = async (relationType: TIssueDuplicateConfirmRelationType) => {
    setPendingAction(relationType);
    try {
      await issueDuplicateSuggestionService.confirm(workspaceSlug, projectId, issueId, suggestion.id, {
        relation_type: relationType,
      });
      onResolved(suggestion.id, true);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("issue_duplicate_suggestions.action_error") });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-subtle p-2.5">
      <ControlLink
        href={workItemLink}
        onClick={() => candidateIssue && handleRedirection(workspaceSlug, candidateIssue, isMobile)}
        className="block"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-13 font-medium text-primary">{suggestion.suggested_issue_name}</span>
          <span className="shrink-0 rounded-full bg-accent-primary/10 px-1.5 py-0.5 text-11 font-medium text-accent-primary">
            {Math.round(suggestion.similarity_score * 100)}%
          </span>
        </div>
        {stateDetails && (
          <div className="mt-1 flex items-center gap-1.5 text-12 text-tertiary">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: stateDetails.color }} />
            {stateDetails.name}
          </div>
        )}
        {suggestion.explanation?.excerpt_candidate && (
          <p className="mt-1.5 line-clamp-2 text-12 text-secondary">
            <HighlightedExcerpt
              text={suggestion.explanation.excerpt_candidate}
              terms={suggestion.explanation.highlighted_terms}
            />
          </p>
        )}
      </ControlLink>
      {canResolve && (
        <div className={cn("flex items-center gap-2")}>
          <Button
            variant="neutral-primary"
            size="sm"
            onClick={handleDismiss}
            loading={pendingAction === "dismiss"}
            disabled={pendingAction !== null}
          >
            {t("issue_duplicate_suggestions.dismiss")}
          </Button>
          <Button
            variant="neutral-primary"
            size="sm"
            onClick={() => handleConfirm("relates_to")}
            loading={pendingAction === "relates_to"}
            disabled={pendingAction !== null}
          >
            {t("issue_duplicate_suggestions.mark_related")}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleConfirm("duplicate")}
            loading={pendingAction === "duplicate"}
            disabled={pendingAction !== null}
          >
            {t("issue_duplicate_suggestions.mark_duplicate")}
          </Button>
        </div>
      )}
    </div>
  );
});
