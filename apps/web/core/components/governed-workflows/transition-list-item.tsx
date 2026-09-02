/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { StateGroupIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkflowTransition } from "@plane/types";
import { AlertModalCore, CustomMenu, ToggleSwitch } from "@plane/ui";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { WorkflowTransitionService } from "@/services/workflow-transition.service";
// local imports
import { FREEZE_WARNING_MESSAGE, wouldFreezeIssueTypeBucket } from "./utils";

const workflowTransitionService = new WorkflowTransitionService();

type Props = {
  transition: TWorkflowTransition;
  allTransitions: TWorkflowTransition[];
  workspaceSlug: string;
  projectId: string;
  onEdit: () => void;
  onChanged: () => void;
};

export const WorkflowTransitionListItem = observer(function WorkflowTransitionListItem(props: Props) {
  const { transition, allTransitions, workspaceSlug, projectId, onEdit, onChanged } = props;
  const { t } = useTranslation();
  const { getStateById } = useProjectState();
  const [isToggling, setIsToggling] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [freezeConfirmModal, setFreezeConfirmModal] = useState<"toggle" | "delete" | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fromStateDetails = transition.from_state ? getStateById(transition.from_state) : undefined;
  const toStateDetails = getStateById(transition.to_state);

  const applyToggle = async () => {
    setIsToggling(true);
    try {
      await workflowTransitionService.update(workspaceSlug, projectId, transition.id, {
        is_active: !transition.is_active,
      });
      onChanged();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("governed_workflows.transition_list_item.toast.error"),
        message: t("governed_workflows.transition_list_item.toast.update_error"),
      });
    } finally {
      setIsToggling(false);
    }
  };

  const handleToggle = () => {
    // Only deactivating (not activating) can ever trip the freezing trap.
    if (transition.is_active && wouldFreezeIssueTypeBucket(allTransitions, transition, "deactivate")) {
      setFreezeConfirmModal("toggle");
      return;
    }
    applyToggle();
  };

  const applyDelete = async () => {
    setIsDeleting(true);
    try {
      await workflowTransitionService.remove(workspaceSlug, projectId, transition.id);
      setDeleteModal(false);
      setFreezeConfirmModal(null);
      onChanged();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("governed_workflows.transition_list_item.toast.error"),
        message: t("governed_workflows.transition_list_item.toast.delete_error"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClick = () => {
    // Deleting soft-deletes the row, which - unlike deactivating - can
    // remove the bucket's last row entirely and REOPEN the graph instead
    // of freezing it; `wouldFreezeIssueTypeBucket` accounts for that
    // divergence via the `"delete"` action (see its own doc comment).
    if (transition.is_active && wouldFreezeIssueTypeBucket(allTransitions, transition, "delete")) {
      setFreezeConfirmModal("delete");
      return;
    }
    setDeleteModal(true);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-subtle px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ToggleSwitch value={transition.is_active} onChange={handleToggle} disabled={isToggling} />
          <div className="flex min-w-0 items-center gap-1.5 text-13 font-medium text-primary">
            {fromStateDetails ? (
              <span className="flex items-center gap-1">
                <StateGroupIcon
                  stateGroup={fromStateDetails.group}
                  color={fromStateDetails.color}
                  className="size-3.5"
                />
                {fromStateDetails.name}
              </span>
            ) : (
              <span className="text-tertiary">{t("governed_workflows.transition_list_item.from_creation")}</span>
            )}
            <ArrowRight className="size-3.5 shrink-0 text-tertiary" />
            <span className="flex items-center gap-1">
              {toStateDetails && (
                <StateGroupIcon stateGroup={toStateDetails.group} color={toStateDetails.color} className="size-3.5" />
              )}
              {toStateDetails?.name ?? t("governed_workflows.transition_list_item.unknown_state")}
            </span>
          </div>
        </div>
        <CustomMenu
          customButton={<IconButton variant="tertiary" size="sm" icon={MoreHorizontal} />}
          placement="bottom-end"
          closeOnSelect
        >
          <CustomMenu.MenuItem onClick={onEdit} className="flex items-center gap-2">
            <Pencil className="h-3 w-3" /> {t("edit")}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={handleDeleteClick} className="flex items-center gap-2 text-danger-primary">
            <Trash2 className="h-3 w-3" /> {t("delete")}
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
      <p className="text-12 text-tertiary">
        {transition.approvers.length > 0
          ? t("governed_workflows.transition_list_item.approver_count", { count: transition.approvers.length })
          : t("governed_workflows.transition_list_item.no_approver_restriction")}
        {t("governed_workflows.transition_list_item.condition_action_count", {
          conditions: transition.conditions.length,
          actions: transition.actions.length,
        })}
      </p>

      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={applyDelete}
        isSubmitting={isDeleting}
        title={t("governed_workflows.transition_list_item.delete_modal.title")}
        content={t("governed_workflows.transition_list_item.delete_modal.content")}
      />

      <AlertModalCore
        isOpen={freezeConfirmModal !== null}
        handleClose={() => setFreezeConfirmModal(null)}
        handleSubmit={freezeConfirmModal === "delete" ? applyDelete : applyToggle}
        isSubmitting={freezeConfirmModal === "delete" ? isDeleting : isToggling}
        title={t("governed_workflows.transition_list_item.freeze_modal.title")}
        content={FREEZE_WARNING_MESSAGE}
      />
    </div>
  );
});
