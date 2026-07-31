/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { X } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { PriorityIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssuePriorities } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useMilestone } from "@/hooks/store/use-milestone";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { MilestoneService } from "@/services/milestone.service";
// local imports
import { CreateUpdateMilestoneModal } from "../create-update-modal";
import { MilestoneQuickActions } from "../quick-actions";

const milestoneService = new MilestoneService();

type Props = {
  milestoneId: string;
};

export const MilestoneDetailRoot = observer(function MilestoneDetailRoot(props: Props) {
  const { milestoneId } = props;
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getPartialProjectById } = useProject();
  const { getStateById } = useProjectState();
  const {
    getMilestoneById,
    getMilestoneIssuesById,
    fetchMilestoneDetails,
    fetchMilestoneIssues,
    attachIssuesToMilestone,
    detachIssueFromMilestone,
  } = useMilestone();

  const [editModal, setEditModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [availableIssues, setAvailableIssues] = useState<{ id: string; name: string; sequence_id: number }[] | null>(
    null
  );
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);

  const { isLoading } = useSWR(
    workspaceSlug && projectId ? ["MILESTONE_DETAILS", workspaceSlug, projectId, milestoneId] : null,
    workspaceSlug && projectId
      ? () => fetchMilestoneDetails(workspaceSlug.toString(), projectId.toString(), milestoneId)
      : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    workspaceSlug && projectId ? ["MILESTONE_ISSUES", workspaceSlug, projectId, milestoneId] : null,
    workspaceSlug && projectId
      ? () => fetchMilestoneIssues(workspaceSlug.toString(), projectId.toString(), milestoneId)
      : null,
    { revalidateOnFocus: false }
  );

  const milestone = getMilestoneById(milestoneId);
  const issues = getMilestoneIssuesById(milestoneId);
  const project = projectId ? getPartialProjectById(projectId.toString()) : undefined;
  const canModify = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  const openAddModal = async () => {
    if (!workspaceSlug || !projectId) return;
    setAddModal(true);
    setSelectedIssueIds([]);
    const response = await milestoneService.getAvailableIssues(workspaceSlug.toString(), projectId.toString());
    setAvailableIssues(response);
  };

  const handleAttach = async () => {
    if (!workspaceSlug || !projectId || selectedIssueIds.length === 0) return;
    try {
      await attachIssuesToMilestone(workspaceSlug.toString(), projectId.toString(), milestoneId, selectedIssueIds);
      setAddModal(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("milestones.toast.error") });
    }
  };

  const handleDetach = async (issueId: string) => {
    if (!workspaceSlug || !projectId) return;
    try {
      await detachIssueFromMilestone(workspaceSlug.toString(), projectId.toString(), milestoneId, issueId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("milestones.toast.error") });
    }
  };

  if (isLoading && !milestone) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="40px" />
        <Loader.Item height="200px" />
      </Loader>
    );
  }

  if (!milestone) return null;

  return (
    <div className="flex flex-col gap-4">
      <CreateUpdateMilestoneModal isOpen={editModal} handleClose={() => setEditModal(false)} milestone={milestone} />

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-20 font-semibold">{milestone.name}</h2>
          {milestone.target_date && (
            <span className="text-13 text-secondary">
              {t("milestones.target_date")}: {renderFormattedDate(milestone.target_date)}
            </span>
          )}
        </div>
        <MilestoneQuickActions milestone={milestone} />
      </div>

      {milestone.description && <p className="text-13 text-secondary">{milestone.description}</p>}

      <div className="flex items-center justify-between border-b border-subtle pb-2">
        <h3 className="text-14 font-medium">{t("milestones.label")}</h3>
        {canModify && (
          <Button variant="neutral-primary" size="sm" onClick={openAddModal}>
            {t("milestones.add_issues")}
          </Button>
        )}
      </div>

      {issues.length === 0 ? (
        <p className="py-4 text-center text-13 text-secondary">{t("milestones.no_issues_linked")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {issues.map((issue) => {
            const state = getStateById(issue.state_id);
            return (
              <div
                key={issue.id}
                className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle p-2"
              >
                <Link
                  href={`/${workspaceSlug}/browse/${project?.identifier}-${issue.sequence_id}/`}
                  className="flex flex-grow items-center gap-2 truncate text-13"
                >
                  {state && (
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: state.color }} />
                  )}
                  {issue.priority && <PriorityIcon priority={issue.priority as TIssuePriorities} size={12} />}
                  <span className="truncate">{issue.name}</span>
                </Link>
                {canModify && (
                  <button type="button" onClick={() => handleDetach(issue.id)} className="flex-shrink-0">
                    <X className="h-4 w-4 text-tertiary hover:text-danger-primary" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ModalCore
        isOpen={addModal}
        handleClose={() => setAddModal(false)}
        position={EModalPosition.CENTER}
        width={EModalWidth.LG}
      >
        <div className="flex flex-col gap-3 p-5">
          <h3 className="text-16 font-medium">{t("milestones.add_issues")}</h3>
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {availableIssues === null ? (
              <Loader className="flex flex-col gap-2">
                <Loader.Item height="30px" />
                <Loader.Item height="30px" />
              </Loader>
            ) : (
              availableIssues.map((issue) => {
                const isSelected = selectedIssueIds.includes(issue.id);
                return (
                  <label
                    key={issue.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-layer-1"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) =>
                        setSelectedIssueIds((prev) =>
                          e.target.checked ? [...prev, issue.id] : prev.filter((id) => id !== issue.id)
                        )
                      }
                    />
                    <span className="truncate text-13">{issue.name}</span>
                  </label>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="neutral-primary" size="sm" onClick={() => setAddModal(false)}>
              {t("cancel")}
            </Button>
            <Button variant="primary" size="sm" onClick={handleAttach} disabled={selectedIssueIds.length === 0}>
              {t("milestones.add_issues")}
            </Button>
          </div>
        </div>
      </ModalCore>
    </div>
  );
});
