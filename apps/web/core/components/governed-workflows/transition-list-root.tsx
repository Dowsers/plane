/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle, Plus } from "lucide-react";
import useSWR, { mutate } from "swr";
// plane imports
import { Button, Loader } from "@plane/ui";
import type { TWorkflowTransition } from "@plane/types";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { WorkflowTransitionService } from "@/services/workflow-transition.service";
// local imports
import { WorkflowTransitionFormModal } from "./transition-form-modal";
import { WorkflowTransitionListItem } from "./transition-list-item";

const workflowTransitionService = new WorkflowTransitionService();

const TRANSITIONS_KEY = (workspaceSlug: string, projectId: string) =>
  `WORKFLOW_TRANSITIONS_${workspaceSlug}_${projectId}`;

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * "Transitions" tab of the governed-workflows config screen - the
 * from-state -> to-state graph edges themselves (exigence 1-4 of
 * docs/feature-specs/06-automation-workflow-sla.md, "Workflows gouvernes
 * multi-etats avec approbations", in plane-selfhost), each with its own
 * approvers/conditions/actions editable from the same create/edit modal.
 *
 * The always-visible banner below is the "documented loudly" requirement
 * for this feature's single most important gotcha (see this directory's
 * `utils.ts`): once ANY transition is configured, deactivating/deleting
 * every rule does not reopen the workflow, it freezes it. Shown whenever
 * the project has at least one transition configured, not just reactively
 * at the moment of a risky action (see `WorkflowTransitionListItem` for the
 * targeted, per-action confirmation).
 */
export const WorkflowTransitionListRoot = observer(function WorkflowTransitionListRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { fetchProjectStates, getProjectStateIds } = useProjectState();

  const [editingTransition, setEditingTransition] = useState<TWorkflowTransition | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // States are needed to render human-readable from/to state names in the
  // list - fetched here (once) rather than relying on some other part of
  // the settings shell having already loaded them, mirroring how
  // `StateDropdown` itself lazily fetches on first open.
  useSWR(
    getProjectStateIds(projectId)?.length ? null : ["GOVERNED_WORKFLOWS_PROJECT_STATES", workspaceSlug, projectId],
    () => fetchProjectStates(workspaceSlug, projectId),
    { revalidateOnFocus: false }
  );

  const { data: transitions, isLoading } = useSWR(TRANSITIONS_KEY(workspaceSlug, projectId), () =>
    workflowTransitionService.list(workspaceSlug, projectId)
  );

  const refresh = () => mutate(TRANSITIONS_KEY(workspaceSlug, projectId));

  return (
    <div className="flex flex-col gap-4">
      {(transitions?.length ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-subtle bg-surface-2 px-3 py-2.5 text-12 text-secondary">
          <AlertTriangle className="text-amber-600 mt-0.5 size-3.5 shrink-0" />
          <span>
            Once a project has at least one transition rule for an issue type, that type&apos;s workflow becomes
            governed. Untouched transitions stay allowed, but if you deactivate or delete every rule for a type, its
            transitions become <span className="font-medium text-primary">blocked</span>, not open again. To fully
            reopen a type, remove all of its rules.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-13 text-tertiary">
          {transitions?.length ?? 0} transition(s) configured. Issue types without any rule remain fully open.
        </p>
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            setEditingTransition(null);
            setIsFormOpen(true);
          }}
        >
          New transition
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        )}
        {!isLoading && (transitions?.length ?? 0) === 0 && (
          <p className="text-13 text-tertiary">
            No workflow transitions configured yet - every state change is allowed.
          </p>
        )}
        {transitions?.map((transition) => (
          <WorkflowTransitionListItem
            key={transition.id}
            transition={transition}
            allTransitions={transitions}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onEdit={() => {
              setEditingTransition(transition);
              setIsFormOpen(true);
            }}
            onChanged={refresh}
          />
        ))}
      </div>

      <WorkflowTransitionFormModal
        isOpen={isFormOpen}
        handleClose={() => setIsFormOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        transition={editingTransition}
        onSaved={refresh}
      />
    </div>
  );
});
