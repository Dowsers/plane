/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkflowTransition, TWorkflowTransitionPayload } from "@plane/types";
import { Button, Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// components
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// services
import { WorkflowTransitionService } from "@/services/workflow-transition.service";
// local imports
import { ActionList } from "./action-list";
import { ApproverList } from "./approver-list";
import { ConditionList } from "./condition-list";
import type {
  TLocalWorkflowTransitionAction,
  TLocalWorkflowTransitionApprover,
  TLocalWorkflowTransitionCondition,
} from "./types";

const workflowTransitionService = new WorkflowTransitionService();

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  transition: TWorkflowTransition | null;
  onSaved: () => void;
};

const defaultState = () => ({
  isFromCreation: true,
  fromState: null as string | null,
  toState: null as string | null,
  isActive: true,
  approvers: [] as TLocalWorkflowTransitionApprover[],
  conditions: [] as TLocalWorkflowTransitionCondition[],
  actions: [] as TLocalWorkflowTransitionAction[],
});

/**
 * Create/edit modal for a single `WorkflowTransition` (a from-state ->
 * to-state graph edge) - exigence 1/4 of
 * docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
 * multi-etats avec approbations") in plane-selfhost. Structurally mirrors
 * the sibling `WorkflowRuleFormModal`/`SLAPolicyFormModal` for its overall
 * shape (local form state, client-side validation, `setToast` with the
 * API's verbatim `error` message on failure).
 *
 * `issue_type` is deliberately NOT exposed in this form - Issue Types have
 * no usable UI anywhere in this Community-edition build (confirmed:
 * `apps/web/ce/components/issues/issue-modal/issue-type-select.tsx` is a
 * hard no-op stub, an EE-only feature surface), so every transition created
 * here applies to "all issue types" (`issue_type: null`), which is the only
 * value an issue in this deployment can actually have. The field is kept on
 * the wire type/payload for forward compatibility with a future EE build
 * that does expose Issue Types, but this UI has nothing meaningful to offer
 * for it today - a deliberate scope-narrowing, not an oversight.
 *
 * `from_state: null` means "from issue creation" (exigence 4), NOT "any
 * state" - there is no wildcard from-state in this data model at all, so
 * the UI presents an explicit two-way choice rather than an "any" option
 * that doesn't exist server-side.
 */
export function WorkflowTransitionFormModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, transition, onSaved } = props;
  const [state, setState] = useState(defaultState());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (transition) {
      setState({
        isFromCreation: transition.from_state === null,
        fromState: transition.from_state,
        toState: transition.to_state,
        isActive: transition.is_active,
        approvers: (transition.approvers ?? []).map((approver, index) =>
          Object.assign({}, approver, { _key: approver.id ?? `local-approver-${index}` })
        ),
        conditions: (transition.conditions ?? []).map((condition, index) =>
          Object.assign({}, condition, { _key: condition.id ?? `local-condition-${index}` })
        ),
        actions: (transition.actions ?? []).map((action, index) =>
          Object.assign({}, action, { _key: action.id ?? `local-action-${index}` })
        ),
      });
    } else {
      setState(defaultState());
    }
  }, [transition, isOpen]);

  const validate = (): string | null => {
    if (!state.toState) return "Choose the destination state.";
    if (!state.isFromCreation && !state.fromState) return "Choose the origin state, or switch to “From creation”.";
    if (!state.isFromCreation && state.fromState === state.toState) return "The origin and destination states must differ.";
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: validationError });
      return;
    }
    const toState = state.toState;
    if (!toState) return; // unreachable - validate() already caught this, narrows the type below

    const payload: TWorkflowTransitionPayload = {
      issue_type: null,
      from_state: state.isFromCreation ? null : state.fromState,
      to_state: toState,
      is_active: state.isActive,
      approvers: state.approvers.map((approver) => ({
        id: approver.id,
        member: approver.member,
        role: approver.role,
        approval_required: approver.approval_required,
      })),
      conditions: state.conditions.map((condition) => ({
        id: condition.id,
        condition_type: condition.condition_type,
        config: condition.config,
      })),
      actions: state.actions.map((action, index) => ({
        id: action.id,
        action_type: action.action_type,
        config: action.config,
        sort_order: index,
      })),
    };

    setIsSaving(true);
    try {
      if (transition) {
        await workflowTransitionService.update(workspaceSlug, projectId, transition.id, payload);
      } else {
        await workflowTransitionService.create(workspaceSlug, projectId, payload);
      }
      onSaved();
      handleClose();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to save the workflow transition.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto py-5">
        <div className="flex items-center justify-between px-5">
          <h4 className="text-18 font-medium text-primary">{transition ? "Edit transition" : "New transition"}</h4>
          <button onClick={handleClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-13 font-medium text-secondary">From</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-13 text-primary">
                  <input
                    type="radio"
                    checked={state.isFromCreation}
                    onChange={() => setState((prev) => ({ ...prev, isFromCreation: true }))}
                  />
                  From creation
                </label>
                <label className="flex items-center gap-1.5 text-13 text-primary">
                  <input
                    type="radio"
                    checked={!state.isFromCreation}
                    onChange={() => setState((prev) => ({ ...prev, isFromCreation: false }))}
                  />
                  From state
                </label>
                {!state.isFromCreation && (
                  <StateDropdown
                    projectId={projectId}
                    value={state.fromState}
                    onChange={(value) => setState((prev) => ({ ...prev, fromState: value }))}
                    buttonVariant="border-with-text"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-13 font-medium text-secondary">To state</span>
              <StateDropdown
                projectId={projectId}
                value={state.toState}
                onChange={(value) => setState((prev) => ({ ...prev, toState: value }))}
                buttonVariant="border-with-text"
              />
            </div>

            <label htmlFor="workflow-transition-is-active" className="flex items-center gap-1.5 text-13 text-secondary">
              <Checkbox
                id="workflow-transition-is-active"
                checked={state.isActive}
                onChange={(event) => setState((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Active
            </label>
          </div>

          <ApproverList
            projectId={projectId}
            approvers={state.approvers}
            onChange={(approvers) => setState((prev) => ({ ...prev, approvers }))}
          />

          <ConditionList
            projectId={projectId}
            conditions={state.conditions}
            onChange={(conditions) => setState((prev) => ({ ...prev, conditions }))}
          />

          <ActionList
            projectId={projectId}
            actions={state.actions}
            onChange={(actions) => setState((prev) => ({ ...prev, actions }))}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
            Save transition
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
