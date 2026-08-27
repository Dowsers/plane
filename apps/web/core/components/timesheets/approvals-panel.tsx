/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TTimesheetPeriod } from "@plane/types";
import { Button, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import { IssueWorklogService } from "@/services/issue/issue_worklog.service";
// local imports
import { TimesheetRejectModal } from "./reject-modal";

const issueWorklogService = new IssueWorklogService();

const PENDING_APPROVALS_KEY = (workspaceSlug: string, projectId: string) =>
  `TIMESHEET_PENDING_APPROVALS_${workspaceSlug}_${projectId}`;

type Props = {
  workspaceSlug: string;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 3 "Workflow d'approbation de timesheet",
 * "Considérations API/UX") in plane-selfhost - "Nouvel onglet
 * 'Approbations' (visible uniquement si timesheet_approval_enabled est
 * actif et que l'utilisateur est approbateur ou Admin) ... listant les
 * périodes submitted en attente avec actions rapides Approuver/Rejeter."
 *
 * `TimesheetPeriodViewSet.get_queryset` (apps/api/plane/app/views/
 * issue_worklog/timesheet.py) already scopes results server-side to "own
 * periods only" for non-approvers and "every period in the project" for
 * the project_lead/workspace Admin - so this panel simply lists, per
 * project the current user is a member of, whatever `status=submitted`
 * periods that same endpoint returns for them. A project where the user
 * isn't the approver/Admin will come back empty (not filtered out here)
 * since the eligibility check server-side is authoritative.
 */
export const TimesheetApprovalsPanel = observer(function TimesheetApprovalsPanel(props: Props) {
  const { workspaceSlug } = props;
  const { joinedProjectIds, getProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const { data: currentUser } = useUser();
  const [rejectTarget, setRejectTarget] = useState<TTimesheetPeriod | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);

  // Mirrors `_is_approver_or_admin` (apps/api/plane/app/views/issue_worklog/
  // timesheet.py) exactly: a workspace Admin sees every time-tracking
  // project's submissions, everyone else only the projects where they are
  // the `project_lead` - narrows the fan-out of per-project list calls
  // below rather than issuing one per joined project regardless of
  // eligibility.
  const eligibleProjectIds = (joinedProjectIds ?? []).filter((projectId) => {
    const project = getProjectById(projectId);
    if (!project?.is_time_tracking_enabled) return false;
    if (isWorkspaceAdmin) return true;
    const lead = project.project_lead;
    const leadId = typeof lead === "string" ? lead : lead?.id;
    return !!currentUser?.id && leadId === currentUser.id;
  });

  const { data, isLoading } = useSWR(
    eligibleProjectIds.length > 0 ? PENDING_APPROVALS_KEY(workspaceSlug, eligibleProjectIds.join(",")) : null,
    async () => {
      const perProject = await Promise.all(
        eligibleProjectIds.map((projectId) =>
          issueWorklogService
            .getTimesheetPeriods(workspaceSlug, projectId, { status: "submitted" })
            .then((response) => response.results)
            .catch(() => [] as TTimesheetPeriod[])
        )
      );
      return perProject.flat();
    }
  );

  const refresh = () => {
    if (eligibleProjectIds.length > 0) {
      void mutate(PENDING_APPROVALS_KEY(workspaceSlug, eligibleProjectIds.join(",")));
    }
  };

  const handleApprove = async (period: TTimesheetPeriod) => {
    setActingOn(period.id);
    try {
      await issueWorklogService.approveTimesheetPeriod(workspaceSlug, period.project, period.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Approved", message: "The timesheet period was approved." });
      refresh();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to approve the timesheet period.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setActingOn(null);
    }
  };

  const handleReject = async (rejectionReason: string) => {
    if (!rejectTarget) return;
    await issueWorklogService.rejectTimesheetPeriod(
      workspaceSlug,
      rejectTarget.project,
      rejectTarget.id,
      rejectionReason
    );
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Rejected", message: "The timesheet period was rejected." });
    refresh();
  };

  const periods = data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-h6-medium text-primary">Pending approvals</h3>
        <Pill variant={EPillVariant.INFO} size={EPillSize.SM}>
          {periods.length}
        </Pill>
      </div>

      {isLoading && (
        <Loader className="flex flex-col gap-2">
          <Loader.Item height="48px" />
          <Loader.Item height="48px" />
        </Loader>
      )}

      {!isLoading && periods.length === 0 && (
        <p className="py-6 text-center text-13 text-tertiary">No timesheets are waiting for your approval.</p>
      )}

      {!isLoading && periods.length > 0 && (
        <div className="flex flex-col gap-2">
          {periods.map((period) => (
            <div
              key={period.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle p-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-13 font-medium text-primary">
                  {period.logged_by_detail?.display_name ?? "—"} · {period.project_detail?.name ?? "—"}
                </span>
                <span className="text-12 text-tertiary">
                  {renderFormattedDate(period.period_start)} – {renderFormattedDate(period.period_end)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="link-primary"
                  size="sm"
                  loading={actingOn === period.id}
                  disabled={actingOn !== null}
                  onClick={() => handleApprove(period)}
                >
                  Approve
                </Button>
                <Button
                  variant="link-danger"
                  size="sm"
                  disabled={actingOn !== null}
                  onClick={() => setRejectTarget(period)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TimesheetRejectModal
        isOpen={!!rejectTarget}
        handleClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
      />
    </div>
  );
});
