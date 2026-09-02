/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ListChecks, MoreHorizontal, Pause, Pencil, Play, Repeat, Trash2, Zap } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRecurringIssueTemplate } from "@plane/types";
import { AlertModalCore, CustomMenu, ToggleSwitch } from "@plane/ui";
import { calculateTimeAgo, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// services
import { RecurringIssueTemplateService } from "@/services/recurring-issue-template.service";
// local imports
import { formatRecurrenceSummary } from "./constants";

const recurringIssueTemplateService = new RecurringIssueTemplateService();

type Props = {
  template: TRecurringIssueTemplate;
  workspaceSlug: string;
  projectId: string;
  /** Admin/Member - Guests get read-only access (matches the backend's own
   * `WRITE_ROLES`), so every mutating action here must stay hidden/disabled
   * for them rather than relying on the API alone to reject the request. */
  canEdit: boolean;
  onEdit: () => void;
  onViewGeneratedIssues: () => void;
  onChanged: (updated?: TRecurringIssueTemplate) => void;
};

export function RecurringIssueTemplateListItem(props: Props) {
  const { template, workspaceSlug, projectId, canEdit, onEdit, onViewGeneratedIssues, onChanged } = props;
  const { t } = useTranslation();
  const [isToggling, setIsToggling] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isDraft = !template.frequency || !template.start_date;

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      const updated = template.is_active
        ? await recurringIssueTemplateService.pause(workspaceSlug, projectId, template.id)
        : await recurringIssueTemplateService.resume(workspaceSlug, projectId, template.id);
      onChanged(updated);
    } catch (error: unknown) {
      const message =
        (error as { error?: string })?.error ?? t("recurring_issue_templates.list_item.errors.update_failed");
      setToast({ type: TOAST_TYPE.ERROR, title: t("recurring_issue_templates.list_item.errors.toast_title"), message });
    } finally {
      setIsToggling(false);
    }
  };

  const handleGenerateNow = async () => {
    setIsGenerating(true);
    try {
      const issue = await recurringIssueTemplateService.generateNow(workspaceSlug, projectId, template.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("recurring_issue_templates.list_item.success.toast_title"),
        message: t("recurring_issue_templates.list_item.success.generated_message", { name: issue.name }),
      });
    } catch (error: unknown) {
      const message =
        (error as { error?: string })?.error ?? t("recurring_issue_templates.list_item.errors.generate_failed");
      setToast({ type: TOAST_TYPE.ERROR, title: t("recurring_issue_templates.list_item.errors.toast_title"), message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await recurringIssueTemplateService.remove(workspaceSlug, projectId, template.id);
      setDeleteModal(false);
      onChanged();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("recurring_issue_templates.list_item.errors.toast_title"),
        message: t("recurring_issue_templates.list_item.errors.delete_failed"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-subtle px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ToggleSwitch
            value={template.is_active}
            onChange={handleToggle}
            disabled={isToggling || !canEdit || isDraft}
          />
          <Repeat className="h-3.5 w-3.5 shrink-0 text-tertiary" />
          <span className="truncate text-13 font-medium text-primary">{template.name}</span>
          {isDraft && (
            <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-0.5 text-11 text-tertiary">
              {t("recurring_issue_templates.list_item.draft")}
            </span>
          )}
        </div>
        <CustomMenu
          customButton={<IconButton variant="tertiary" size="sm" icon={MoreHorizontal} />}
          placement="bottom-end"
          closeOnSelect
        >
          <CustomMenu.MenuItem onClick={onEdit} className="flex items-center gap-2" disabled={!canEdit}>
            <Pencil className="h-3 w-3" /> {isDraft ? t("recurring_issue_templates.list_item.configure") : t("edit")}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem
            onClick={handleToggle}
            className="flex items-center gap-2"
            disabled={!canEdit || isDraft || isToggling}
          >
            {template.is_active ? (
              <>
                <Pause className="h-3 w-3" /> {t("recurring_issue_templates.list_item.pause")}
              </>
            ) : (
              <>
                <Play className="h-3 w-3" /> {t("recurring_issue_templates.list_item.resume")}
              </>
            )}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={onViewGeneratedIssues} className="flex items-center gap-2">
            <ListChecks className="h-3 w-3" /> {t("recurring_issue_templates.list_item.view_generated")}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem
            onClick={handleGenerateNow}
            className="flex items-center gap-2"
            disabled={!canEdit || isDraft || isGenerating}
          >
            <Zap className="h-3 w-3" /> {t("recurring_issue_templates.list_item.generate_now")}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem
            onClick={() => setDeleteModal(true)}
            className="flex items-center gap-2 text-danger-primary"
            disabled={!canEdit}
          >
            <Trash2 className="h-3 w-3" /> {t("delete")}
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
      <p className="text-12 text-tertiary">
        {formatRecurrenceSummary(template)}
        {!isDraft && (
          <>
            {" - "}
            {template.is_active ? (
              template.next_run_at ? (
                <Tooltip
                  tooltipContent={`${renderFormattedDate(template.next_run_at)}, ${renderFormattedTime(template.next_run_at)}`}
                >
                  <span>
                    {t("recurring_issue_templates.list_item.next_run", {
                      time_ago: calculateTimeAgo(template.next_run_at),
                    })}
                  </span>
                </Tooltip>
              ) : (
                <span>{t("recurring_issue_templates.list_item.next_run_pending")}</span>
              )
            ) : (
              <span>{t("recurring_issue_templates.list_item.paused")}</span>
            )}
            {" - "}
            {t("recurring_issue_templates.list_item.occurrences_generated", {
              count: template.occurrences_generated,
            })}
          </>
        )}
      </p>
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("recurring_issue_templates.list_item.delete_modal.title")}
        content={t("recurring_issue_templates.list_item.delete_modal.content", { name: template.name })}
      />
    </div>
  );
}
