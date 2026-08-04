/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Copy, History, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
// plane imports
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkflowRule } from "@plane/types";
import { AlertModalCore, CustomMenu, ToggleSwitch } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
// services
import { WorkflowRuleService } from "@/services/workflow-rule.service";
// local imports
import { TRIGGER_TYPE_LABELS } from "./constants";

const workflowRuleService = new WorkflowRuleService();

type Props = {
  rule: TWorkflowRule;
  workspaceSlug: string;
  projectId: string;
  onEdit: () => void;
  onViewLogs: () => void;
  onChanged: () => void;
};

export function WorkflowRuleListItem(props: Props) {
  const { rule, workspaceSlug, projectId, onEdit, onViewLogs, onChanged } = props;
  const [isToggling, setIsToggling] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      await workflowRuleService.toggle(workspaceSlug, projectId, rule.id);
      onChanged();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to update the rule." });
    } finally {
      setIsToggling(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      await workflowRuleService.duplicate(workspaceSlug, projectId, rule.id);
      onChanged();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Rule duplicated." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to duplicate the rule." });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await workflowRuleService.remove(workspaceSlug, projectId, rule.id);
      setDeleteModal(false);
      onChanged();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to delete the rule." });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-subtle px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ToggleSwitch value={rule.is_active} onChange={handleToggle} disabled={isToggling} />
          <span className="truncate text-13 font-medium text-primary">{rule.name}</span>
          <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-0.5 text-11 text-tertiary">
            {TRIGGER_TYPE_LABELS[rule.trigger_type]}
          </span>
        </div>
        <CustomMenu
          customButton={<IconButton variant="tertiary" size="sm" icon={MoreHorizontal} />}
          placement="bottom-end"
          closeOnSelect
        >
          <CustomMenu.MenuItem onClick={onEdit} className="flex items-center gap-2">
            <Pencil className="h-3 w-3" /> Edit
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={handleDuplicate} className="flex items-center gap-2">
            <Copy className="h-3 w-3" /> Duplicate
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={onViewLogs} className="flex items-center gap-2">
            <History className="h-3 w-3" /> View execution history
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem
            onClick={() => setDeleteModal(true)}
            className="flex items-center gap-2 text-danger-primary"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
      <p className="text-12 text-tertiary">
        {rule.conditions.length} condition(s) - {rule.actions.length} action(s) - triggered {rule.execution_count}{" "}
        time(s)
        {rule.last_triggered_at && <> - last run {calculateTimeAgo(rule.last_triggered_at)}</>}
      </p>
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title="Delete rule"
        content={`Are you sure you want to delete "${rule.name}"? This action cannot be undone.`}
      />
    </div>
  );
}
