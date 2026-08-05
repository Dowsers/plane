/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import useSWR from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssuePriorities, TSLAPolicy, TSLAPolicyPayload, TSLAStateGroup } from "@plane/types";
import { Button, Checkbox, CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// components
import { ProjectSelect } from "@/components/analytics/select/project";
import { DashboardGenericMultiSelect } from "@/components/dashboards/editor/selects/generic-multi-select";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
// services
import { SLAPolicyService } from "@/services/sla-policy.service";
// local imports
import {
  DEFAULT_CRITICAL_THRESHOLD_PERCENT,
  DEFAULT_WARNING_THRESHOLD_PERCENT,
  ERROR_NAME_REQUIRED,
  ERROR_NO_TIME_BUDGET,
  ERROR_THRESHOLD_ORDER,
  SLA_PRIORITY_OPTIONS,
  SLA_STATE_GROUP_OPTIONS,
} from "./constants";

const slaPolicyService = new SLAPolicyService();

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  policy: TSLAPolicy | null;
  onSaved: () => void;
};

type TDurationUnit = "minutes" | "hours" | "days";

const UNIT_OPTIONS: { value: TDurationUnit; label: string }[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

const UNIT_TO_MINUTES: Record<TDurationUnit, number> = { minutes: 1, hours: 60, days: 1440 };

type TDurationState = { value: string; unit: TDurationUnit };

const EMPTY_DURATION: TDurationState = { value: "", unit: "hours" };

/** Picks the largest unit that divides the stored minutes evenly, purely
 * for a nicer default when re-opening an existing policy - the stored
 * value is always minutes regardless of what unit was used to enter it. */
const minutesToDurationState = (minutes: number | null): TDurationState => {
  if (!minutes) return EMPTY_DURATION;
  if (minutes % 1440 === 0) return { value: String(minutes / 1440), unit: "days" };
  if (minutes % 60 === 0) return { value: String(minutes / 60), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
};

const durationStateToMinutes = (state: TDurationState): number | null => {
  const parsed = Number(state.value);
  if (!state.value || Number.isNaN(parsed) || parsed <= 0) return null;
  return Math.round(parsed * UNIT_TO_MINUTES[state.unit]);
};

const defaultState = () => ({
  name: "",
  description: "",
  isActive: true,
  appliesToAllProjects: true,
  projectIds: [] as string[],
  priorityFilter: [] as TIssuePriorities[],
  labelIds: [] as string[],
  assigneeIds: [] as string[],
  stateGroupFilter: [] as TSLAStateGroup[],
  responseTime: EMPTY_DURATION,
  resolutionTime: EMPTY_DURATION,
  warningThresholdPercent: DEFAULT_WARNING_THRESHOLD_PERCENT,
  criticalThresholdPercent: DEFAULT_CRITICAL_THRESHOLD_PERCENT,
});

/**
 * Create/edit modal for a single SLA policy. Structurally mirrors the
 * sibling `WorkflowRuleFormModal`
 * (apps/web/core/components/automations/workflow-rules/rule-form-modal.tsx,
 * referenced for pattern only, not imported from - `SLAPolicy` is
 * workspace-scoped, not project-scoped, and has a materially different
 * field set) for its overall shape: local form state, client-side
 * validation mirroring the backend's own rules, `setToast` on failure with
 * the API's verbatim `error` message when available.
 *
 * Picker reuse, chosen per-field based on scope fit:
 * - Project scope: `ProjectSelect` (apps/web/core/components/analytics/
 *   select/project.tsx) - the same multi-project-select Category 5's
 *   custom-dashboards widget editor already reuses for its own
 *   `project_ids` field, which has the identical shape as this policy's
 *   own project scoping.
 * - Assignees: `MemberDropdown` (apps/web/core/components/dropdowns/
 *   member/dropdown.tsx) in `multiple` mode with no `projectId` - core,
 *   pre-existing app infrastructure (not owned by any single feature) that
 *   already falls back to workspace-wide members when `projectId` is
 *   omitted, which is exactly this policy's own scope.
 * - Priority / labels / state group: `DashboardGenericMultiSelect`
 *   (apps/web/core/components/dashboards/editor/selects/
 *   generic-multi-select.tsx) - deliberately NOT the sibling
 *   `WorkflowRuleFormModal`'s own `MultiValueChipPicker`+`PriorityDropdown`/
 *   `LabelDropdown` combo, because those two dropdowns are project-scoped
 *   (`LabelDropdown` in particular has no workspace-wide mode at all - see
 *   apps/web/core/components/issues/issue-layouts/properties/
 *   label-dropdown.tsx) and this policy can span multiple/all projects.
 *   `DashboardGenericMultiSelect` is a small, genuinely generic "pick N
 *   from a list" primitive with zero SLA/workflow-rule-specific coupling,
 *   already used by Category 5's dashboards for this exact
 *   priority/label/assignee/state filter shape on its own workspace-level,
 *   multi-project `table` widget - the closest structural precedent to
 *   this feature that exists anywhere in the codebase. There is no
 *   dedicated "state group" picker anywhere else (confirmed by direct
 *   search), so `state_group_filter` is fed the same generic component
 *   with this feature's own fixed 6-value option list (see
 *   `SLA_STATE_GROUP_OPTIONS` in ./constants.ts).
 */
export function SLAPolicyFormModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, policy, onSaved } = props;
  const [state, setState] = useState(defaultState());
  const [isSaving, setIsSaving] = useState(false);

  const { workspaceProjectIds, getProjectById } = useProject();
  const { workspaceLabels, fetchWorkspaceLabels } = useLabel();

  useSWR(
    isOpen ? ["SLA_POLICY_FORM_WORKSPACE_LABELS", workspaceSlug] : null,
    isOpen ? () => fetchWorkspaceLabels(workspaceSlug) : null,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (policy) {
      setState({
        name: policy.name,
        description: policy.description,
        isActive: policy.is_active,
        appliesToAllProjects: policy.applies_to_all_projects,
        projectIds: policy.project_ids,
        priorityFilter: policy.priority_filter,
        labelIds: policy.label_ids,
        assigneeIds: policy.assignee_ids,
        stateGroupFilter: policy.state_group_filter,
        responseTime: minutesToDurationState(policy.response_time_minutes),
        resolutionTime: minutesToDurationState(policy.resolution_time_minutes),
        warningThresholdPercent: policy.warning_threshold_percent,
        criticalThresholdPercent: policy.critical_threshold_percent,
      });
    } else {
      setState(defaultState());
    }
  }, [policy, isOpen]);

  const responseMinutes = durationStateToMinutes(state.responseTime);
  const resolutionMinutes = durationStateToMinutes(state.resolutionTime);
  const showNoProjectsWarning = !state.appliesToAllProjects && state.projectIds.length === 0;

  const validate = (): string | null => {
    if (!state.name.trim()) return ERROR_NAME_REQUIRED;
    if (!responseMinutes && !resolutionMinutes) return ERROR_NO_TIME_BUDGET;
    if (state.criticalThresholdPercent <= state.warningThresholdPercent) return ERROR_THRESHOLD_ORDER;
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: validationError });
      return;
    }

    const payload: TSLAPolicyPayload = {
      name: state.name.trim(),
      description: state.description.trim(),
      is_active: state.isActive,
      applies_to_all_projects: state.appliesToAllProjects,
      project_ids: state.appliesToAllProjects ? [] : state.projectIds,
      priority_filter: state.priorityFilter,
      label_ids: state.labelIds,
      assignee_ids: state.assigneeIds,
      state_group_filter: state.stateGroupFilter,
      response_time_minutes: responseMinutes,
      resolution_time_minutes: resolutionMinutes,
      warning_threshold_percent: state.warningThresholdPercent,
      critical_threshold_percent: state.criticalThresholdPercent,
    };

    setIsSaving(true);
    try {
      if (policy) {
        await slaPolicyService.update(workspaceSlug, policy.id, payload);
      } else {
        await slaPolicyService.create(workspaceSlug, payload);
      }
      onSaved();
      handleClose();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to save the SLA policy.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSaving(false);
    }
  };

  const labelOptions = (workspaceLabels ?? []).map((label) => ({ value: label.id, label: label.name }));

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto py-5">
        <div className="flex items-center justify-between px-5">
          <h4 className="text-18 font-medium text-primary">{policy ? "Edit SLA policy" : "New SLA policy"}</h4>
          <button onClick={handleClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5">
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder="Policy name"
              value={state.name}
              onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
              className="flex-1"
              inputSize="sm"
            />
            <label htmlFor="sla-policy-is-active" className="flex shrink-0 items-center gap-1.5 text-13 text-secondary">
              <Checkbox
                id="sla-policy-is-active"
                checked={state.isActive}
                onChange={(event) => setState((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Active
            </label>
          </div>

          <TextArea
            placeholder="Description (optional)"
            value={state.description}
            onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
            textAreaSize="sm"
            className="min-h-[50px] w-full"
          />

          <div className="flex flex-col gap-2">
            <h5 className="text-13 font-medium text-secondary">Project scope</h5>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-13 text-primary">
                <input
                  type="radio"
                  checked={state.appliesToAllProjects}
                  onChange={() => setState((prev) => ({ ...prev, appliesToAllProjects: true }))}
                />
                All projects
              </label>
              <label className="flex items-center gap-1.5 text-13 text-primary">
                <input
                  type="radio"
                  checked={!state.appliesToAllProjects}
                  onChange={() => setState((prev) => ({ ...prev, appliesToAllProjects: false }))}
                />
                Specific projects
              </label>
            </div>
            {!state.appliesToAllProjects && (
              <ProjectSelect
                value={state.projectIds}
                onChange={(val) => setState((prev) => ({ ...prev, projectIds: val ?? [] }))}
                projectIds={workspaceProjectIds ?? []}
              />
            )}
            {!state.appliesToAllProjects && state.projectIds.length > 0 && (
              <p className="text-11 text-tertiary">
                {state.projectIds.map((id) => getProjectById(id)?.name ?? id).join(", ")}
              </p>
            )}
            {showNoProjectsWarning && (
              <div className="bg-amber-50 text-amber-700 flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-11">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  This policy applies to no project yet - choose &quot;All projects&quot; or select at least one
                  project, otherwise it will never match any work item.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-secondary">Priority</span>
              <DashboardGenericMultiSelect
                value={state.priorityFilter}
                onChange={(val) => setState((prev) => ({ ...prev, priorityFilter: val as TIssuePriorities[] }))}
                options={SLA_PRIORITY_OPTIONS}
                placeholder="Any priority"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-secondary">State group</span>
              <DashboardGenericMultiSelect
                value={state.stateGroupFilter}
                onChange={(val) => setState((prev) => ({ ...prev, stateGroupFilter: val as TSLAStateGroup[] }))}
                options={SLA_STATE_GROUP_OPTIONS}
                placeholder="Any state group"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-secondary">Labels</span>
              <DashboardGenericMultiSelect
                value={state.labelIds}
                onChange={(val) => setState((prev) => ({ ...prev, labelIds: val }))}
                options={labelOptions}
                placeholder="Any label"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-secondary">Assignees</span>
              <MemberDropdown
                multiple
                value={state.assigneeIds}
                onChange={(val) => setState((prev) => ({ ...prev, assigneeIds: val }))}
                buttonVariant="border-with-text"
                placeholder="Any assignee"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-secondary">Response time</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 30"
                  value={state.responseTime.value}
                  onChange={(event) =>
                    setState((prev) => ({ ...prev, responseTime: { ...prev.responseTime, value: event.target.value } }))
                  }
                  inputSize="sm"
                  className="flex-1"
                />
                <CustomSelect
                  value={state.responseTime.unit}
                  label={UNIT_OPTIONS.find((option) => option.value === state.responseTime.unit)?.label}
                  onChange={(value: TDurationUnit) =>
                    setState((prev) => ({ ...prev, responseTime: { ...prev.responseTime, unit: value } }))
                  }
                  input
                >
                  {UNIT_OPTIONS.map((option) => (
                    <CustomSelect.Option key={option.value} value={option.value}>
                      {option.label}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-secondary">Resolution time</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 4"
                  value={state.resolutionTime.value}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      resolutionTime: { ...prev.resolutionTime, value: event.target.value },
                    }))
                  }
                  inputSize="sm"
                  className="flex-1"
                />
                <CustomSelect
                  value={state.resolutionTime.unit}
                  label={UNIT_OPTIONS.find((option) => option.value === state.resolutionTime.unit)?.label}
                  onChange={(value: TDurationUnit) =>
                    setState((prev) => ({ ...prev, resolutionTime: { ...prev.resolutionTime, unit: value } }))
                  }
                  input
                >
                  {UNIT_OPTIONS.map((option) => (
                    <CustomSelect.Option key={option.value} value={option.value}>
                      {option.label}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
            </div>
          </div>
          <p className="text-11 text-tertiary">At least one of response time or resolution time must be set.</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-secondary">Warning threshold (%)</span>
              <Input
                type="number"
                min={1}
                max={99}
                value={state.warningThresholdPercent}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, warningThresholdPercent: Number(event.target.value) }))
                }
                inputSize="sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-13 font-medium text-secondary">Critical threshold (%)</span>
              <Input
                type="number"
                min={1}
                max={100}
                value={state.criticalThresholdPercent}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, criticalThresholdPercent: Number(event.target.value) }))
                }
                inputSize="sm"
              />
            </div>
          </div>
          <p className="text-11 text-tertiary">
            The critical threshold must be greater than the warning threshold - both are percentages of the total time
            budget elapsed before the SLA is due.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
            Save policy
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
