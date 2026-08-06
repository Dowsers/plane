/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { WorkflowTransitionService } from "@/services/workflow-transition.service";
// local imports
import type { TWorkItemStateDropdownBaseProps } from "./base";
import { WorkItemStateDropdownBase } from "./base";

const workflowTransitionService = new WorkflowTransitionService();

type TWorkItemStateDropdownProps = Omit<
  TWorkItemStateDropdownBaseProps,
  "stateIds" | "getStateById" | "onDropdownOpen" | "isInitializing" | "allowedTransitions"
> & {
  stateIds?: string[];
  /**
   * Governed workflows (docs/feature-specs/06-automation-workflow-sla.md,
   * section 4 in plane-selfhost) - set this to annotate each option with
   * whether changing THIS issue to it right now is allowed, denied (with a
   * reason), or gated behind approval, via `IssueAllowedTransitionsEndpoint`.
   * Deliberately opt-in: most `StateDropdown` consumers pick a state for
   * something other than an existing issue's own current state (issue
   * creation, a workflow-rule/transition-action's target state, etc.),
   * where no transition graph applies at all - see this feature's other
   * call sites for which ones actually pass it.
   */
  issueId?: string;
};

export const StateDropdown = observer(function StateDropdown(props: TWorkItemStateDropdownProps) {
  const { projectId, stateIds: propsStateIds, issueId } = props;
  // router params
  const { workspaceSlug } = useParams();
  // states
  const [stateLoader, setStateLoader] = useState(false);
  // store hooks
  const { fetchProjectStates, getProjectStateIds, getStateById } = useProjectState();
  // derived values
  const stateIds = propsStateIds ?? getProjectStateIds(projectId);

  // fetch states if not provided
  const onDropdownOpen = async () => {
    if ((stateIds === undefined || stateIds.length === 0) && workspaceSlug && projectId) {
      setStateLoader(true);
      await fetchProjectStates(workspaceSlug.toString(), projectId);
      setStateLoader(false);
    }
  };

  const slug = workspaceSlug?.toString();
  const shouldFetchAllowedTransitions = Boolean(slug && projectId && issueId);
  const { data: allowedTransitions } = useSWR(
    shouldFetchAllowedTransitions ? ["ISSUE_ALLOWED_TRANSITIONS", slug, projectId, issueId] : null,
    shouldFetchAllowedTransitions && slug && projectId && issueId
      ? () => workflowTransitionService.allowedTransitions(slug, projectId, issueId)
      : null,
    { revalidateOnFocus: false }
  );

  return (
    <WorkItemStateDropdownBase
      {...props}
      getStateById={getStateById}
      isInitializing={stateLoader}
      stateIds={stateIds ?? []}
      onDropdownOpen={onDropdownOpen}
      allowedTransitions={allowedTransitions}
    />
  );
});
