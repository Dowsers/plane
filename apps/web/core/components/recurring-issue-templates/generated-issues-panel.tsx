/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import useSWR from "swr";
// plane imports
import { PriorityIcon } from "@plane/propel/icons";
import type { TRecurringIssueTemplate } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { generateWorkItemLink } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
// services
import { RecurringIssueTemplateService } from "@/services/recurring-issue-template.service";

const recurringIssueTemplateService = new RecurringIssueTemplateService();
const PER_PAGE = 20;

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  template: TRecurringIssueTemplate;
};

/**
 * Paginated list of the work items a single recurring template has
 * produced so far - `GET .../recurring-issue-templates/<id>/
 * generated-issues/`, standard cursor pagination. Each row links to the
 * work item's real detail route (`generateWorkItemLink`, the
 * `/browse/<identifier>-<sequence_id>/` shape - not a guessed
 * `/issues/<id>` path).
 */
export function RecurringIssueTemplateGeneratedIssuesPanel(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, template } = props;
  const { getProjectIdentifierById } = useProject();
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const projectIdentifier = getProjectIdentifierById(projectId);

  const { data, isLoading } = useSWR(
    isOpen ? ["RECURRING_TEMPLATE_GENERATED_ISSUES", workspaceSlug, projectId, template.id, cursor] : null,
    isOpen
      ? () =>
          recurringIssueTemplateService.generatedIssues(workspaceSlug, projectId, template.id, {
            cursor,
            per_page: PER_PAGE,
          })
      : null
  );

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-16 font-medium text-primary">Generated work items - {template.name}</h4>
          <button onClick={handleClose} type="button" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col divide-y divide-subtle-1">
          {data?.results.map((issue) => (
            <Link
              key={issue.id}
              href={generateWorkItemLink({
                workspaceSlug,
                projectId,
                issueId: issue.id,
                projectIdentifier,
                sequenceId: issue.sequence_id,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 py-2 hover:bg-layer-1"
            >
              <PriorityIcon priority={issue.priority} size={14} />
              <span className="shrink-0 text-caption-sm-regular text-tertiary">
                {projectIdentifier}-{issue.sequence_id}
              </span>
              <span className="truncate text-13 text-primary">{issue.name}</span>
            </Link>
          ))}
          {isLoading && (
            <Loader className="flex flex-col gap-2 py-2">
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
            </Loader>
          )}
          {!isLoading && (data?.results.length ?? 0) === 0 && (
            <p className="py-6 text-center text-13 text-tertiary">
              No work items have been generated from this template yet.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle pt-3">
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={!data?.prev_page_results || !data?.prev_cursor}
            onClick={() => setCursor(data?.prev_cursor)}
          >
            Previous
          </Button>
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={!data?.next_page_results || !data?.next_cursor}
            onClick={() => setCursor(data?.next_cursor)}
          >
            Next
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
