/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { HelpCircle } from "lucide-react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
import { ControlLink, Loader } from "@plane/ui";
import { generateWorkItemLink } from "@plane/utils";
// hooks
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useProject } from "@/hooks/store/use-project";
// services
import { IssueService } from "@/services/issue/issue.service";

const issueService = new IssueService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  similarIssueIds: string[];
};

/**
 * "Pourquoi cette suggestion ?" popover (spec's own wording,
 * "Considerations API/UX" section) - lists the historical issues
 * (`IssueTriageSuggestion.similar_issue_ids`) the similarity search matched
 * against, as clickable links that open each one's peek overview. Fetched
 * on demand via `IssueService.retrieveIssues` rather than going through the
 * issue store's `issuesMap` - these are historical issues that are very
 * likely NOT already loaded in whatever list/board the current issue's own
 * peek view was opened from, and `getIssueById` is a pure in-memory lookup
 * with no server fallback (see `IssueStore.getIssueById`).
 *
 * Uses a `Popover` (not a passive `Tooltip`) specifically because its
 * content needs to be clickable - a `Tooltip`'s content disappears on
 * mouseleave before a click into it can register, same reasoning as
 * `ViewSubscriptionBell`'s own `Popover` choice for its interactive panel.
 */
export const SimilarIssuesPopover = observer(function SimilarIssuesPopover(props: Props) {
  const { workspaceSlug, projectId, similarIssueIds } = props;
  const { t } = useTranslation();
  const { getProjectIdentifierById } = useProject();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();

  const swrKey =
    similarIssueIds.length > 0
      ? `ai-triage-similar-issues-${workspaceSlug}-${projectId}-${similarIssueIds.join(",")}`
      : null;
  const { data: similarIssues, isLoading } = useSWR(swrKey, () =>
    issueService.retrieveIssues(workspaceSlug, projectId, similarIssueIds)
  );

  if (similarIssueIds.length === 0) return null;

  const projectIdentifier = getProjectIdentifierById(projectId);

  return (
    <Popover>
      <Popover.Button className="inline-flex items-center gap-1 text-12 text-tertiary hover:text-secondary hover:underline">
        <HelpCircle className="size-3" aria-hidden="true" />
        {t("ai.triage.why_suggestion")}
      </Popover.Button>
      <Popover.Panel side="bottom" align="start">
        <div className="max-h-64 w-72 overflow-y-auto rounded-lg border-[0.5px] border-strong bg-surface-1 p-2 shadow-raised-200">
          <p className="px-1 pb-1.5 text-12 font-medium text-tertiary">{t("ai.triage.based_on_issues")}</p>
          {isLoading && (
            <Loader className="space-y-1.5 px-1">
              <Loader.Item height="16px" />
              <Loader.Item height="16px" />
            </Loader>
          )}
          {!isLoading && (!similarIssues || similarIssues.length === 0) && (
            <p className="px-1 text-12 text-tertiary">{t("ai.triage.similar_issues_unavailable")}</p>
          )}
          {similarIssues?.map((issue) => {
            const workItemLink = generateWorkItemLink({
              workspaceSlug,
              projectId,
              issueId: issue.id,
              projectIdentifier,
              sequenceId: issue.sequence_id,
            });
            return (
              <ControlLink
                key={issue.id}
                href={workItemLink}
                onClick={() => handleRedirection(workspaceSlug, issue, isMobile)}
                className="block rounded-sm px-1 py-1 text-13 text-primary hover:bg-layer-2"
              >
                <span className="text-tertiary">
                  {projectIdentifier}-{issue.sequence_id}
                </span>{" "}
                <span className="truncate">{issue.name}</span>
              </ControlLink>
            );
          })}
        </div>
      </Popover.Panel>
    </Popover>
  );
});
