/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
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

const scopeSummary = (
  policy: TSLAPolicy,
  projectCount: number,
  t: (key: string, values?: Record<string, unknown>) => string
): string => {
  if (policy.applies_to_all_projects) return t("sla_policies.scope.all_projects");
  if (projectCount === 0) return t("sla_policies.list_item.no_projects");
  return projectCount === 1
    ? t("sla_policies.list_item.project_count_one", { count: projectCount })
    : t("sla_policies.list_item.project_count_other", { count: projectCount });
};

const chipOrDash = (values: string[], labels: Record<string, string>, prefix: string): string => {
  if (values.length === 0) return "—";
  return `${prefix}: ${values.map((value) => labels[value] ?? value).join(", ")}`;
};

export function SLAPolicyListItem(props: Props) {
  const { policy, workspaceSlug, canMoveUp, canMoveDown, onEdit, onChanged, onReorder } = props;
  const { t } = useTranslation();
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
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.errors.default.title"),
        message: t("sla_policies.list_item.update_error"),
      });
    } finally {
      setIsToggling(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      await slaPolicyService.duplicate(workspaceSlug, policy.id);
      onChanged();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.success"),
        message: t("sla_policies.list_item.duplicate_success"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.errors.default.title"),
        message: t("sla_policies.list_item.duplicate_error"),
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await slaPolicyService.remove(workspaceSlug, policy.id);
      setDeleteModal(false);
      onChanged();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.errors.default.title"),
        message: t("sla_policies.list_item.delete_error"),
      });
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
              aria-label={t("sla_policies.list_item.move_up")}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => onReorder("down")}
              className="text-tertiary hover:text-primary disabled:opacity-30"
              aria-label={t("sla_policies.list_item.move_down")}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
          <ToggleSwitch value={policy.is_active} onChange={handleToggle} disabled={isToggling} />
          <span className="truncate text-13 font-medium text-primary">{policy.name}</span>
          <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-0.5 text-11 text-tertiary">
            {scopeSummary(policy, projectNames.length, t)}
          </span>
        </div>
        <CustomMenu
          customButton={<IconButton variant="tertiary" size="sm" icon={MoreHorizontal} />}
          placement="bottom-end"
          closeOnSelect
        >
          <CustomMenu.MenuItem onClick={onEdit} className="flex items-center gap-2">
            <Pencil className="h-3 w-3" /> {t("common.actions.edit")}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={handleDuplicate} className="flex items-center gap-2">
            <Copy className="h-3 w-3" /> {t("common.duplicate")}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem
            onClick={() => setDeleteModal(true)}
            className="flex items-center gap-2 text-danger-primary"
          >
            <Trash2 className="h-3 w-3" /> {t("common.actions.delete")}
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-tertiary">
        <span>
          {t("sla_policies.fields.response_time")}: {formatSLAMinutes(policy.response_time_minutes)}
        </span>
        <span>
          {t("sla_policies.fields.resolution_time")}: {formatSLAMinutes(policy.resolution_time_minutes)}
        </span>
        <span>{chipOrDash(policy.priority_filter, SLA_PRIORITY_LABELS, t("sla_policies.fields.priority"))}</span>
        <span>
          {chipOrDash(policy.state_group_filter, SLA_STATE_GROUP_LABELS, t("sla_policies.fields.state_group"))}
        </span>
        <span>
          {policy.label_ids.length > 0
            ? `${t("sla_policies.fields.labels")}: ${policy.label_ids.length}`
            : `${t("sla_policies.fields.labels")}: —`}
        </span>
        <span>
          {policy.assignee_ids.length > 0
            ? `${t("sla_policies.fields.assignees")}: ${policy.assignee_ids.length}`
            : `${t("sla_policies.fields.assignees")}: —`}
        </span>
      </p>
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("sla_policies.delete_confirm.title")}
        content={t("sla_policies.list_item.delete_confirm_content", { name: policy.name })}
      />
    </div>
  );
}
