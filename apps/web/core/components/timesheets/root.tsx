/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Tabs } from "@plane/propel/tabs";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { TimesheetApprovalsPanel } from "./approvals-panel";
import { MyTimesheet } from "./my-time";
import { WorkspaceWorklogReport } from "./workspace-report";

type Props = {
  workspaceSlug: string;
};

const TAB_MY_TIME = "my-time";
const TAB_REPORT = "report";
const TAB_APPROVALS = "approvals";

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", features 2 and 3) in plane-selfhost - top-level "Timesheets"
 * workspace page: "My time" (personal view, default tab, any member), a
 * workspace-wide aggregated "Report" (Admin-only server-side - see
 * WorkspaceWorklogReportEndpoint's `@allow_permission([ROLE.ADMIN],
 * level="WORKSPACE")` - hidden here for non-Admins rather than shown and
 * erroring), and an "Approvals" tab gated by `Workspace.
 * timesheet_approval_enabled` AND the current user being either a
 * workspace Admin or the `project_lead` of at least one time-tracking
 * project (the two ways `_is_approver_or_admin`,
 * apps/api/plane/app/views/issue_worklog/timesheet.py, grants approve/
 * reject access). This client-side gate is a UX convenience only - every
 * mutating endpoint re-checks eligibility server-side regardless.
 */
export const TimesheetsRoot = observer(function TimesheetsRoot(props: Props) {
  const { workspaceSlug } = props;
  const [activeTab, setActiveTab] = useState<string>(TAB_MY_TIME);
  const { currentWorkspace } = useWorkspace();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { joinedProjectIds, getProjectById } = useProject();

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);

  const isProjectLeadSomewhere = useMemo(() => {
    if (!currentUser?.id) return false;
    return (joinedProjectIds ?? []).some((projectId) => {
      const project = getProjectById(projectId);
      const lead = project?.project_lead;
      const leadId = typeof lead === "string" ? lead : lead?.id;
      return !!project?.is_time_tracking_enabled && leadId === currentUser.id;
    });
  }, [joinedProjectIds, getProjectById, currentUser?.id]);

  const showApprovalsTab =
    !!currentWorkspace?.timesheet_approval_enabled && (isWorkspaceAdmin || isProjectLeadSomewhere);

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as string)}>
      <Tabs.List>
        <Tabs.Trigger value={TAB_MY_TIME}>My time</Tabs.Trigger>
        {isWorkspaceAdmin && <Tabs.Trigger value={TAB_REPORT}>Report</Tabs.Trigger>}
        {showApprovalsTab && <Tabs.Trigger value={TAB_APPROVALS}>Approvals</Tabs.Trigger>}
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value={TAB_MY_TIME} className="pt-4">
        <MyTimesheet workspaceSlug={workspaceSlug} />
      </Tabs.Content>
      {isWorkspaceAdmin && (
        <Tabs.Content value={TAB_REPORT} className="pt-4">
          <WorkspaceWorklogReport workspaceSlug={workspaceSlug} />
        </Tabs.Content>
      )}
      {showApprovalsTab && (
        <Tabs.Content value={TAB_APPROVALS} className="pt-4">
          <TimesheetApprovalsPanel workspaceSlug={workspaceSlug} />
        </Tabs.Content>
      )}
    </Tabs>
  );
});
