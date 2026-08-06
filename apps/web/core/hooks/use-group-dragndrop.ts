/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EIssuesStoreType, TIssue, TIssueGroupByOptions, TIssueOrderByOptions } from "@plane/types";
import type { GroupDropLocation } from "@/components/issues/issue-layouts/utils";
import { handleGroupDragDrop } from "@/components/issues/issue-layouts/utils";
import { getIssueUpdateErrorMessage } from "@/helpers/workflow-transition.helper";
import { WorkflowTransitionService } from "@/services/workflow-transition.service";
import { ISSUE_FILTER_DEFAULT_DATA } from "@/store/issue/helpers/base-issues.store";
import { useIssueDetail } from "./store/use-issue-detail";
import { useIssues } from "./store/use-issues";
import { useIssuesActions } from "./use-issues-actions";

const workflowTransitionService = new WorkflowTransitionService();

type DNDStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.PROFILE
  | EIssuesStoreType.ARCHIVED
  | EIssuesStoreType.WORKSPACE_DRAFT
  | EIssuesStoreType.TEAM
  | EIssuesStoreType.TEAM_VIEW
  | EIssuesStoreType.EPIC
  | EIssuesStoreType.TEAM_PROJECT_WORK_ITEMS;

export const useGroupIssuesDragNDrop = (
  storeType: DNDStoreType,
  orderBy: TIssueOrderByOptions | undefined,
  groupBy: TIssueGroupByOptions | undefined,
  subGroupBy?: TIssueGroupByOptions
) => {
  const { workspaceSlug } = useParams();

  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { updateIssue } = useIssuesActions(storeType);
  const {
    issues: { getIssueIds, addCycleToIssue, removeCycleFromIssue, changeModulesInIssue },
  } = useIssues(storeType);

  /**
   * update Issue on Drop, checks if modules or cycles are changed and then calls appropriate functions
   * @param projectId
   * @param issueId
   * @param data
   * @param issueUpdates
   */
  const updateIssueOnDrop = async (
    projectId: string,
    issueId: string,
    data: Partial<TIssue>,
    issueUpdates: {
      [groupKey: string]: {
        ADD: string[];
        REMOVE: string[];
      };
    }
  ) => {
    const errorToastProps = {
      type: TOAST_TYPE.ERROR,
      title: "Error!",
      message: "Error while updating work item",
    };
    const moduleKey = ISSUE_FILTER_DEFAULT_DATA["module"];
    const cycleKey = ISSUE_FILTER_DEFAULT_DATA["cycle"];
    const stateKey = ISSUE_FILTER_DEFAULT_DATA["state"];

    const isModuleChanged = Object.keys(data).includes(moduleKey);
    const isCycleChanged = Object.keys(data).includes(cycleKey);
    const isStateChanged = Object.keys(data).includes(stateKey);

    // Governed workflows (docs/feature-specs/06-automation-workflow-sla.md,
    // section 4 in plane-selfhost) - dragging a card into a new state
    // column is the exact same "state change" the state-dropdown gates (see
    // apps/web/core/components/dropdowns/state/base.tsx), but a drag
    // gesture has no picker UI to disable options on ahead of time. A
    // drop-time pre-flight check against `IssueAllowedTransitionsEndpoint`
    // is used instead of a live per-column drag-time gate (the CE
    // `use-workflow-drag-n-drop.ts` extension point Plane's own paid tier
    // reserves for that fuller visual treatment stays untouched - out of
    // scope here, see this feature's delivery notes) - denied drops are
    // stopped before ever calling `updateIssue` (no optimistic flicker),
    // pending-approval drops get a proactive heads-up toast since the
    // eventual local revert (see `BaseIssuesStore.issueUpdate`) would
    // otherwise look like an unexplained glitch.
    if (isStateChanged && workspaceSlug) {
      const draggedIssue = getIssueById(issueId);
      const targetStateId = data[stateKey];
      if (draggedIssue && targetStateId && draggedIssue.state_id !== targetStateId) {
        try {
          const allowedTransitions = await workflowTransitionService.allowedTransitions(
            workspaceSlug.toString(),
            projectId,
            issueId
          );
          const entry = allowedTransitions.find((candidate) => candidate.state_id === targetStateId);
          if (entry && !entry.allowed) {
            if (entry.reason_code === "APPROVAL_REQUIRED") {
              setToast({
                type: TOAST_TYPE.INFO,
                title: "Approval requested",
                message: entry.reason ?? "This transition requires approval before it takes effect.",
              });
            } else {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: "Transition not allowed",
                message: entry.reason ?? "This transition is not part of the configured workflow.",
              });
              delete data[stateKey];
            }
          }
        } catch {
          // Best-effort - a failed pre-flight check should not block a drag
          // that would otherwise have gone through untouched before this
          // feature existed (fail open, matching the engine's own
          // backward-compatibility default for a project with no rules).
        }
      }
    }

    if (isCycleChanged && workspaceSlug) {
      if (data[cycleKey]) {
        addCycleToIssue(workspaceSlug.toString(), projectId, data[cycleKey]?.toString() ?? "", issueId).catch(() =>
          setToast(errorToastProps)
        );
      } else {
        removeCycleFromIssue(workspaceSlug.toString(), projectId, issueId).catch(() => setToast(errorToastProps));
      }
      delete data[cycleKey];
    }

    if (isModuleChanged && workspaceSlug && issueUpdates[moduleKey]) {
      changeModulesInIssue(
        workspaceSlug.toString(),
        projectId,
        issueId,
        issueUpdates[moduleKey].ADD,
        issueUpdates[moduleKey].REMOVE
      ).catch(() => setToast(errorToastProps));
      delete data[moduleKey];
    }

    if (updateIssue) {
      updateIssue(projectId, issueId, data).catch((error) =>
        setToast({ ...errorToastProps, message: getIssueUpdateErrorMessage(error, errorToastProps.message) })
      );
    }
  };

  const handleOnDrop = async (source: GroupDropLocation, destination: GroupDropLocation) => {
    if (
      source.columnId &&
      destination.columnId &&
      destination.columnId === source.columnId &&
      destination.id === source.id
    )
      return;

    await handleGroupDragDrop(
      source,
      destination,
      getIssueById,
      getIssueIds,
      updateIssueOnDrop,
      groupBy,
      subGroupBy,
      orderBy !== "sort_order"
    ).catch((err) => {
      setToast({
        title: "Error!",
        type: TOAST_TYPE.ERROR,
        message: err?.detail ?? "Failed to perform this action",
      });
    });
  };

  return handleOnDrop;
};
