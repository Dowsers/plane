/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Archive, Trash2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssuePriorities } from "@plane/types";
import { AlertModalCore, Button } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { LabelDropdown } from "@/components/issues/issue-layouts/properties/label-dropdown";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";

type Props = {
  className?: string;
  selectionHelpers: TSelectionHelper;
};

export const IssueBulkOperationsActionBar = observer(function IssueBulkOperationsActionBar(props: Props) {
  const { className } = props;
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const storeType = useIssueStoreType();
  const { issues } = useIssues(storeType);
  const { selectedEntityIds, clearSelection } = useMultipleSelectStore();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const issueIds = selectedEntityIds;

  // Bulk operations require a single, known project (list/board/spreadsheet/
  // cycle/module views of one project) - cross-project views (e.g. workspace
  // "All Issues") are not supported by this action bar yet.
  if (!workspaceSlug || !projectId || typeof projectId !== "string") return null;

  const handleError = (error: unknown) => {
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("toast.error"),
      message: error instanceof Error ? error.message : "Something went wrong. Please try again.",
    });
  };

  const runUpdate = async (properties: Record<string, unknown>) => {
    if (issueIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await issues.bulkUpdateProperties(workspaceSlug as string, projectId, {
        issue_ids: issueIds,
        properties,
      });
    } catch (error) {
      handleError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Some issue store variants (e.g. the archived-issues view) don't support
  // bulk-archiving at all - archiveBulkIssues is undefined there.
  const canArchive = typeof issues.archiveBulkIssues === "function";

  const handleArchive = async () => {
    if (!issues.archiveBulkIssues) return;
    setIsSubmitting(true);
    try {
      await issues.archiveBulkIssues(workspaceSlug as string, projectId, issueIds);
      clearSelection();
    } catch (error) {
      handleError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await issues.removeBulkIssues(workspaceSlug as string, projectId, issueIds);
      clearSelection();
    } catch (error) {
      handleError(error);
    } finally {
      setIsSubmitting(false);
      setIsDeleteOpen(false);
    }
  };

  return (
    <>
      <AlertModalCore
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={handleDelete}
        isSubmitting={isSubmitting}
        isOpen={isDeleteOpen}
        title={t("issue.bulk_operations.action_bar.delete_modal.title")}
        content={t("issue.bulk_operations.action_bar.delete_modal.content", { count: issueIds.length })}
      />
      <div className={cn("sticky bottom-0 left-0 z-[2] grid place-items-center px-3.5 pb-3.5", className)}>
        <div className="border-custom-border-200 bg-custom-background-100 shadow-custom-shadow-rg flex w-full flex-wrap items-center gap-2 rounded-md border-[0.5px] px-3.5 py-2">
          <div className="text-sm flex items-center gap-2 pr-2 font-medium">
            <button
              type="button"
              onClick={clearSelection}
              className="hover:bg-custom-background-80 flex items-center justify-center rounded p-1"
              aria-label={t("issue.bulk_operations.action_bar.clear_selection")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {t("issue.bulk_operations.action_bar.selected_count", { count: issueIds.length })}
          </div>

          <StateDropdown
            projectId={projectId}
            value={undefined}
            onChange={(val: string) => runUpdate({ state_id: val })}
            buttonVariant="border-with-text"
            buttonContainerClassName="rounded"
            placeholder={t("common.state")}
          />
          <PriorityDropdown
            value={undefined}
            onChange={(val: TIssuePriorities) => runUpdate({ priority: val })}
            buttonVariant="border-with-text"
            placeholder={t("common.priority")}
          />
          <MemberDropdown
            projectId={projectId}
            value={[]}
            onChange={(val: string[]) => runUpdate({ assignee_ids: val })}
            multiple
            buttonVariant="border-with-text"
            placeholder={t("common.assignees")}
          />
          <LabelDropdown
            projectId={projectId}
            value={[]}
            onChange={(val: string[]) => runUpdate({ label_ids: val })}
            buttonClassName="rounded border border-custom-border-200 px-2 py-1"
            label={<span className="text-xs">{t("common.labels")}</span>}
          />
          <CycleDropdown
            projectId={projectId}
            value={null}
            onChange={(val: string | null) => runUpdate({ cycle_id: val })}
            buttonVariant="border-with-text"
            placeholder={t("common.cycle")}
          />
          <ModuleDropdown
            projectId={projectId}
            value={[]}
            onChange={(val: string[]) => runUpdate({ module_ids: val })}
            multiple
            buttonVariant="border-with-text"
            placeholder={t("common.module")}
          />

          <div className="ml-auto flex items-center gap-1">
            {canArchive && (
              <Button
                variant="neutral-primary"
                size="sm"
                prependIcon={<Archive className="h-3.5 w-3.5" />}
                onClick={handleArchive}
                disabled={isSubmitting}
              >
                {t("archive")}
              </Button>
            )}
            <Button
              variant="neutral-primary"
              size="sm"
              prependIcon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setIsDeleteOpen(true)}
              disabled={isSubmitting}
            >
              {t("delete")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
});
