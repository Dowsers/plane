/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Plus, Timer, Trash2 } from "lucide-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
// local
import { LogTimeModal } from "../create-modal";
import { formatWorklogDuration } from "../utils";

type TIssueWorklogProperty = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 1 "Saisie de temps par work item") in plane-selfhost.
 * Self-wraps in SidebarPropertyListItem (unlike IssueLabel, which is
 * wrapped by its caller) since both call sites (peek-overview/properties.tsx,
 * issue-detail/sidebar.tsx) render this as a bare tag.
 */
export const IssueWorklogProperty = observer(function IssueWorklogProperty(props: TIssueWorklogProperty) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { getProjectById } = useProject();
  const { getUserDetails } = useMember();
  const { data: currentUser } = useUser();
  const {
    worklog: { getWorklogsByIssueId, getWorklogById, getTotalWorklogDurationByIssueId },
    fetchWorklogs,
    removeWorklog,
  } = useIssueDetail();

  const project = getProjectById(projectId);
  const isTimeTrackingEnabled = !!project?.is_time_tracking_enabled;

  useSWR(
    isTimeTrackingEnabled ? ["ISSUE_WORKLOGS", workspaceSlug, projectId, issueId] : null,
    isTimeTrackingEnabled ? () => fetchWorklogs(workspaceSlug, projectId, issueId) : null,
    { revalidateOnFocus: false }
  );

  // Exigence 2 - the whole feature only renders when the project has time
  // tracking enabled.
  if (!isTimeTrackingEnabled) return null;

  const worklogIds = getWorklogsByIssueId(issueId) ?? [];
  const totalDuration = getTotalWorklogDurationByIssueId(issueId);

  const handleRemove = async (worklogId: string) => {
    try {
      await removeWorklog(workspaceSlug, projectId, issueId, worklogId);
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to delete the time entry.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    }
  };

  return (
    <SidebarPropertyListItem
      icon={Timer}
      label={t("common.worklogs")}
      appendElement={
        !disabled && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="hover:bg-neutral-component-surface-dark grid place-items-center rounded p-0.5 text-tertiary hover:text-primary"
          >
            <Plus className="size-3" />
          </button>
        )
      }
    >
      <div className="flex w-full flex-col gap-1">
        <span className="text-body-xs-medium text-primary">{formatWorklogDuration(totalDuration)}</span>
        {worklogIds.length > 0 && (
          <ul className="flex flex-col gap-1">
            {worklogIds.map((worklogId) => {
              const worklog = getWorklogById(worklogId);
              if (!worklog) return null;
              const isOwn = worklog.logged_by === currentUser?.id;
              const isLocked = !!worklog.timesheet_period;
              return (
                <li key={worklog.id} className="flex items-center justify-between gap-2 text-body-xs-regular">
                  <span className="text-secondary">
                    {formatWorklogDuration(worklog.duration)} · {worklog.logged_at}
                    {worklog.logged_by ? ` · ${getUserDetails(worklog.logged_by)?.display_name ?? ""}` : ""}
                  </span>
                  {!disabled && isOwn && !isLocked && (
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={() => handleRemove(worklog.id)} title="Delete">
                        <Trash2 className="hover:text-danger-text size-3 text-tertiary" />
                      </button>
                    </span>
                  )}
                  {isLocked && (
                    <span className="text-tertiary" title="Locked by a submitted or approved timesheet">
                      <Pencil className="size-3 opacity-40" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <LogTimeModal
        isOpen={isModalOpen}
        handleClose={() => setIsModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
      />
    </SidebarPropertyListItem>
  );
});
