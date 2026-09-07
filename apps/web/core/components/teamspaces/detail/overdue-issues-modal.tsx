/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { PriorityIcon, StateGroupIcon } from "@plane/propel/icons";
import type { TIssuePriorities } from "@plane/propel/icons";
import type { TStateGroups } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { generateWorkItemLink, renderFormattedDate } from "@plane/utils";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";

type Props = {
  isOpen: boolean;
  teamspaceId: string;
  handleClose: () => void;
};

// Backs the overview tab's "N overdue work items" banner - lists the
// individual issues behind `overview.overdue_count` so the banner leads
// somewhere real instead of linking back to the page it's already on.
export function TeamspaceOverdueIssuesModal(props: Props) {
  const { isOpen, teamspaceId, handleClose } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceOverdueIssuesById, fetchTeamspaceOverdueIssues } = useTeamspace();

  const { isLoading } = useSWR(
    isOpen && workspaceSlug ? ["TEAMSPACE_OVERDUE_ISSUES", workspaceSlug, teamspaceId] : null,
    isOpen && workspaceSlug ? () => fetchTeamspaceOverdueIssues(workspaceSlug.toString(), teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const overdueIssues = getTeamspaceOverdueIssuesById(teamspaceId);
  const results = overdueIssues?.results ?? [];

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{t("teamspaces.overview.overdue_modal.title")}</h3>

        {isLoading && results.length === 0 ? (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
          </Loader>
        ) : results.length === 0 ? (
          <p className="py-4 text-center text-13 text-secondary">{t("teamspaces.overview.overdue_modal.empty")}</p>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {results.map((issue) => (
              <Link
                key={issue.id}
                href={generateWorkItemLink({
                  workspaceSlug: workspaceSlug?.toString(),
                  projectId: issue.project_id,
                  issueId: issue.id,
                  projectIdentifier: issue.project_identifier,
                  sequenceId: issue.sequence_id,
                })}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-13 hover:bg-layer-1"
              >
                <span className="flex-shrink-0 text-secondary">
                  {issue.project_identifier}-{issue.sequence_id}
                </span>
                {issue.state_group && (
                  <StateGroupIcon stateGroup={issue.state_group as TStateGroups} className="size-3 flex-shrink-0" />
                )}
                <span className="truncate">{issue.name}</span>
                <span className="ml-auto flex flex-shrink-0 items-center gap-2 text-11 text-secondary">
                  <PriorityIcon priority={issue.priority as TIssuePriorities | null} withContainer />
                  {renderFormattedDate(issue.target_date)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ModalCore>
  );
}
