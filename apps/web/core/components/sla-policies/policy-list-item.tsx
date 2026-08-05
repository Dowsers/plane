/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
// plane imports
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSLAPolicy } from "@plane/types";
import { AlertModalCore, CustomMenu, ToggleSwitch } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";
// services
import { SLAPolicyService } from "@/services/sla-policy.service";
// local imports
import { formatSLAMinutes, SLA_PRIORITY_LABELS, SLA_STATE_GROUP_LABELS } from "./constants";

const slaPolicyService = new SLAPolicyService();

type Props = {
  policy: TSLAPolicy;
  workspaceSlug: string;
  /** Undefined for the first/last item respectively - hides that arrow. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onChanged: () => void;
  onReorder: (direction: "up" | "down") => void;
};

const scopeSummary = (policy: TSLAPolicy, projectCount: number): string => {
  if (policy.applies_to_all_projects) return "All projects";
  if (projectCount === 0) return "No projects (never matches)";
  return `${projectCount} project${projectCount === 1 ? "" : "s"}`;
};

const chipOrDash = (values: string[], labels: Record<string, string>, prefix: string): string => {
  if (values.length === 0) return "—";
  return `${prefix}: ${values.map((value) => labels[value] ?? value).join(", ")}`;
};

export function SLAPolicyListItem(props: Props) {
  const { policy, workspaceSlug, canMoveUp, canMoveDown, onEdit, onChanged, onReorder } = props;
  const { getProjectById } = useProject();
  const [isToggling, setIsToggling] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      await slaPolicyService.update(workspaceSlug, policy.id, { is_active: !policy.is_active });
      onChanged();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to update the policy." });
    } finally {
      setIsToggling(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      await slaPolicyService.duplicate(workspaceSlug, policy.id);
      onChanged();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "SLA policy duplicated." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to duplicate the policy." });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await slaPolicyService.remove(workspaceSlug, policy.id);
      setDeleteModal(false);
      onChanged();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to delete the policy." });
    } finally {
      setIsDeleting(false);
    }
  };

  const projectNames = policy.applies_to_all_projects
    ? []
    : policy.project_ids.map((id) => getProjectById(id)?.name ?? id);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-subtle px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => onReorder("up")}
              className="text-tertiary hover:text-primary disabled:opacity-30"
              aria-label="Move up"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => onReorder("down")}
              className="text-tertiary hover:text-primary disabled:opacity-30"
              aria-label="Move down"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
          <ToggleSwitch value={policy.is_active} onChange={handleToggle} disabled={isToggling} />
          <span className="truncate text-13 font-medium text-primary">{policy.name}</span>
          <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-0.5 text-11 text-tertiary">
            {scopeSummary(policy, projectNames.length)}
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
          <CustomMenu.MenuItem
            onClick={() => setDeleteModal(true)}
            className="flex items-center gap-2 text-danger-primary"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-tertiary">
        <span>Response: {formatSLAMinutes(policy.response_time_minutes)}</span>
        <span>Resolution: {formatSLAMinutes(policy.resolution_time_minutes)}</span>
        <span>{chipOrDash(policy.priority_filter, SLA_PRIORITY_LABELS, "Priority")}</span>
        <span>{chipOrDash(policy.state_group_filter, SLA_STATE_GROUP_LABELS, "State group")}</span>
        <span>{policy.label_ids.length > 0 ? `Labels: ${policy.label_ids.length}` : "Labels: —"}</span>
        <span>{policy.assignee_ids.length > 0 ? `Assignees: ${policy.assignee_ids.length}` : "Assignees: —"}</span>
      </p>
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title="Delete SLA policy"
        content={`Are you sure you want to delete "${policy.name}"? Work items already tracked against it keep their historical compliance record.`}
      />
    </div>
  );
}
