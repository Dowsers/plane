/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
// components
import { ProjectAccessRestriction } from "@/components/auth-screens/project/project-access-restriction";
import { InspectionBlockedScreen, InspectionNonComplianceBanner } from "@/components/inspection";
import {
  PROJECT_DETAILS,
  PROJECT_ME_INFORMATION,
  PROJECT_LABELS,
  PROJECT_MEMBERS,
  PROJECT_MEMBER_PREFERENCES,
  PROJECT_STATES,
  PROJECT_ESTIMATES,
  PROJECT_ALL_CYCLES,
  PROJECT_MODULES,
  PROJECT_VIEWS,
  PROJECT_INTAKE_STATE,
} from "@/constants/fetch-keys";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useCycle } from "@/hooks/store/use-cycle";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useProjectView } from "@/hooks/store/use-project-view";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useInspectionObligations } from "@/hooks/use-inspection-obligations";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";

interface IProjectAuthWrapper {
  workspaceSlug: string;
  projectId: string;
  children: ReactNode;
  isLoading?: boolean;
}

export const ProjectAuthWrapper = observer(function ProjectAuthWrapper(props: IProjectAuthWrapper) {
  const { workspaceSlug, projectId, children, isLoading: isParentLoading = false } = props;
  // states
  const [isJoiningProject, setIsJoiningProject] = useState(false);
  // store hooks
  const { fetchUserProjectInfo, allowPermissions, getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { fetchProjectDetails, currentProjectDetails } = useProject();
  const { joinProject } = useUserPermissions();
  const { fetchAllCycles } = useCycle();
  const { fetchModulesSlim, fetchModules } = useModule();
  const { initGantt } = useTimeLineChart(GANTT_TIMELINE_TYPE.MODULE);
  const { fetchViews } = useProjectView();
  const {
    project: { fetchProjectMembers, fetchProjectUserProperties },
  } = useMember();
  const { fetchProjectStates, fetchProjectIntakeState } = useProjectState();
  const { data: currentUserData } = useUser();
  const { fetchProjectLabels } = useLabel();
  const { getProjectEstimates } = useProjectEstimates();
  // derived values
  const hasPermissionToCurrentProject = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  const currentProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);
  // Initialize module timeline chart
  useEffect(() => {
    initGantt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fetching project details
  const { isLoading: isProjectDetailsLoading, error: projectDetailsError } = useSWR(
    PROJECT_DETAILS(workspaceSlug, projectId),
    () => fetchProjectDetails(workspaceSlug, projectId)
  );
  // fetching user project member information
  useSWR(PROJECT_ME_INFORMATION(workspaceSlug, projectId), () => fetchUserProjectInfo(workspaceSlug, projectId));
  // fetching project member preferences
  useSWR(
    currentUserData?.id ? PROJECT_MEMBER_PREFERENCES(projectId, currentProjectRole) : null,
    currentUserData?.id ? () => fetchProjectUserProperties(workspaceSlug, projectId) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetching project labels
  useSWR(PROJECT_LABELS(projectId, currentProjectRole), () => fetchProjectLabels(workspaceSlug, projectId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });
  // fetching project members
  useSWR(PROJECT_MEMBERS(projectId, currentProjectRole), () => fetchProjectMembers(workspaceSlug, projectId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });
  // fetching project states
  useSWR(PROJECT_STATES(projectId, currentProjectRole), () => fetchProjectStates(workspaceSlug, projectId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });
  // fetching project intake state
  useSWR(PROJECT_INTAKE_STATE(projectId, currentProjectRole), () => fetchProjectIntakeState(workspaceSlug, projectId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });
  // fetching project estimates
  useSWR(PROJECT_ESTIMATES(projectId, currentProjectRole), () => getProjectEstimates(workspaceSlug, projectId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });
  // fetching project cycles
  useSWR(PROJECT_ALL_CYCLES(projectId, currentProjectRole), () => fetchAllCycles(workspaceSlug, projectId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });
  // fetching project modules
  useSWR(
    PROJECT_MODULES(projectId, currentProjectRole),
    async () => {
      await Promise.all([fetchModulesSlim(workspaceSlug, projectId), fetchModules(workspaceSlug, projectId)]);
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetching project views
  useSWR(PROJECT_VIEWS(projectId, currentProjectRole), () => fetchViews(workspaceSlug, projectId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });

  // Inspection compliance obligations of the CURRENT user on this project.
  // Gated on the project's own `is_inspection_enabled` flag (exposed by the
  // generic project serializer) so an ordinary project costs zero extra
  // requests. The endpoint behind this hook is on the enforcement gate's
  // exemption list, so it keeps answering even for a fully blocked member.
  const {
    data: inspectionData,
    outstanding: inspectionOutstanding,
    blocked: inspectionBlocked,
    nextSignable: inspectionNextSignable,
    refresh: refreshInspection,
  } = useInspectionObligations(workspaceSlug, projectId, Boolean(currentProjectDetails?.is_inspection_enabled));

  // handle join project
  const handleJoinProject = () => {
    setIsJoiningProject(true);
    joinProject(workspaceSlug, projectId).finally(() => setIsJoiningProject(false));
  };

  const isProjectLoading = (isParentLoading || isProjectDetailsLoading) && !projectDetailsError;

  if (isProjectLoading) return null;

  if (!isProjectLoading && hasPermissionToCurrentProject === false) {
    return (
      <ProjectAccessRestriction
        errorStatusCode={projectDetailsError?.status}
        isWorkspaceAdmin={isWorkspaceAdmin}
        handleJoinProject={handleJoinProject}
        isJoinButtonDisabled={isJoiningProject}
      />
    );
  }

  // Inspection compliance (ISO/IEC 17020 §4.1/§4.2). Checked here, after the
  // membership gate above, because this is the one wrapper every project
  // sub-route passes through - and because the backend blocks READS as well as
  // writes once a grace period elapses, so without this the sibling useSWR calls
  // would just surface a wall of 403s with no way forward.
  //
  // Replacing the subtree (rather than overlaying a modal) mirrors
  // `ProjectAccessRestriction` above: a modal would imply something usable sits
  // behind it, and here nothing does. The banner, by contrast, is additive -
  // during the grace period the project is fully usable.
  if (inspectionBlocked.length > 0) {
    return (
      <InspectionBlockedScreen
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        projectName={currentProjectDetails?.name}
        blocked={inspectionBlocked}
        nextSignable={inspectionNextSignable}
        onSigned={refreshInspection}
      />
    );
  }

  return (
    <>
      {inspectionOutstanding.length > 0 ? (
        <InspectionNonComplianceBanner
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          outstanding={inspectionOutstanding}
          nextSignable={inspectionNextSignable}
          gracePeriodDays={inspectionData?.inspection_grace_period_days ?? 7}
          onSigned={refreshInspection}
        />
      ) : null}
      {children}
    </>
  );
});
