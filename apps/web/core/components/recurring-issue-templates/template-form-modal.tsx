/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TIssuePriorities,
  TRecurringIssueFrequency,
  TRecurringIssueTemplate,
  TRecurringIssueTemplatePayload,
} from "@plane/types";
import { Button, Checkbox, CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { TimezoneSelect } from "@/components/global/timezone-select";
import { DateDropdown } from "@/components/dropdowns/date";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { IssueLabelSelect } from "@/components/issues/select";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useProject } from "@/hooks/store/use-project";
// services
import { RecurringIssueTemplateService } from "@/services/recurring-issue-template.service";
// local imports
import { FREQUENCY_OPTIONS, MONTH_OPTIONS } from "./constants";
import { WeekdayPicker } from "./weekday-picker";

const recurringIssueTemplateService = new RecurringIssueTemplateService();

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  /** `null` creates a brand-new template. A non-`null` template edits it in
   * place - this also covers activating a `convert-to-recurring` draft
   * (a template with `is_active: false`, `frequency: null`, `start_date:
   * null`): the same form, just pre-filled with fewer fields set. */
  template: TRecurringIssueTemplate | null;
  onSaved: (template: TRecurringIssueTemplate) => void;
};

type FormState = {
  name: string;
  descriptionText: string;
  priority: TIssuePriorities;
  stateId: string | null;
  estimatePointId: string | undefined;
  labelIds: string[];
  assigneeIds: string[];
  frequency: TRecurringIssueFrequency | null;
  interval: number;
  weekdays: number[];
  dayOfMonth: number | null;
  monthOfYear: number | null;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  maxOccurrences: number | null;
  isActive: boolean;
};

/** The backend only ever persists `description_html` from user input (its
 * own plain-text `description` is server-derived by stripping tags) - see
 * `RecurringIssueTemplate.save()`. A plain textarea is used here rather
 * than the full rich-text issue-description editor (see this component
 * directory's own notes / the task report for why), so on save its raw
 * text is escaped and wrapped into simple `<p>` paragraphs so it still
 * renders sensibly wherever a generated issue's description_html is later
 * displayed through the normal rich-text viewer. */
const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const textToHtml = (text: string): string => {
  if (!text.trim()) return "<p></p>";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");
};

const htmlToPlainText = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<\/?p>/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

const defaultState = (defaultTimezone: string): FormState => ({
  name: "",
  descriptionText: "",
  priority: "none",
  stateId: null,
  estimatePointId: undefined,
  labelIds: [],
  assigneeIds: [],
  frequency: null,
  interval: 1,
  weekdays: [],
  dayOfMonth: null,
  monthOfYear: null,
  timezone: defaultTimezone,
  startDate: null,
  endDate: null,
  maxOccurrences: null,
  isActive: true,
});

/**
 * Create/edit modal for a single recurring issue template - the same field
 * pickers (state/priority/assignees/labels/estimate) the issue creation
 * modal itself uses (see `IssueDefaultProperties` in
 * `apps/web/core/components/issues/issue-modal/components/default-properties.tsx`),
 * since a template is standing in for the issue it will eventually
 * produce. Also doubles as the "configure and activate" form for a draft
 * template returned by `POST .../issues/<id>/convert-to-recurring/` -
 * opened pre-filled with `template` in that case.
 */
export function RecurringIssueTemplateFormModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, template, onSaved } = props;
  const { getProjectById } = useProject();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();

  const projectTimezone = getProjectById(projectId)?.timezone ?? "UTC";
  const [state, setState] = useState<FormState>(defaultState(projectTimezone));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (template) {
      setState({
        name: template.name,
        descriptionText: htmlToPlainText(template.description_html ?? ""),
        priority: template.priority,
        stateId: template.state_id,
        estimatePointId: template.estimate_point_id ?? undefined,
        labelIds: template.label_ids ?? [],
        assigneeIds: template.assignee_ids ?? [],
        frequency: template.frequency,
        interval: template.interval || 1,
        weekdays: template.weekdays ?? [],
        dayOfMonth: template.day_of_month,
        monthOfYear: template.month_of_year,
        timezone: template.timezone || projectTimezone,
        startDate: template.start_date,
        endDate: template.end_date,
        maxOccurrences: template.max_occurrences,
        isActive: template.is_active,
      });
    } else {
      setState(defaultState(projectTimezone));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, isOpen]);

  const canActivate = !!state.frequency && !!state.startDate;

  const validate = (): string | null => {
    if (!state.name.trim()) return "Name is required.";
    if (state.isActive && !canActivate) return "Frequency and a start date are required to make this template active.";
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: validationError });
      return;
    }

    const payload: TRecurringIssueTemplatePayload = {
      name: state.name.trim(),
      description_html: textToHtml(state.descriptionText),
      priority: state.priority,
      state_id: state.stateId,
      estimate_point_id: state.estimatePointId ?? null,
      frequency: state.frequency,
      interval: state.interval || 1,
      weekdays: state.frequency === "WEEKLY" ? state.weekdays : [],
      day_of_month: state.frequency === "MONTHLY" || state.frequency === "YEARLY" ? state.dayOfMonth : null,
      month_of_year: state.frequency === "YEARLY" ? state.monthOfYear : null,
      timezone: state.timezone,
      start_date: state.startDate,
      end_date: state.endDate,
      max_occurrences: state.maxOccurrences,
      is_active: state.isActive,
      label_ids: state.labelIds,
      assignee_ids: state.assigneeIds,
    };

    setIsSaving(true);
    try {
      const saved = template
        ? await recurringIssueTemplateService.update(workspaceSlug, projectId, template.id, payload)
        : await recurringIssueTemplateService.create(workspaceSlug, projectId, payload);
      onSaved(saved);
      handleClose();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to save the recurring template.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSaving(false);
    }
  };

  const minEndDate = getDate(state.startDate ?? undefined);

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto py-5">
        <div className="flex items-center justify-between px-5">
          <h4 className="text-18 font-medium text-primary">
            {template ? "Edit recurring template" : "New recurring template"}
          </h4>
          <button onClick={handleClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5">
          <div className="flex flex-col gap-1">
            <Input
              type="text"
              placeholder="Template name"
              value={state.name}
              onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full"
              inputSize="sm"
            />
            <p className="text-caption-sm-regular text-tertiary">
              Use the <code className="rounded-xs bg-surface-2 px-1">{"{{date}}"}</code> token to include the
              occurrence&apos;s date, e.g. &quot;Weekly standup — {"{{date}}"}&quot;.
            </p>
          </div>

          <TextArea
            placeholder="Description (optional)"
            value={state.descriptionText}
            onChange={(event) => setState((prev) => ({ ...prev, descriptionText: event.target.value }))}
            textAreaSize="sm"
            className="min-h-[70px] w-full"
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="h-7">
              <StateDropdown
                value={state.stateId ?? undefined}
                onChange={(stateId) => setState((prev) => ({ ...prev, stateId }))}
                projectId={projectId}
                buttonVariant="border-with-text"
              />
            </div>
            <div className="h-7">
              <PriorityDropdown
                value={state.priority}
                onChange={(priority) => setState((prev) => ({ ...prev, priority }))}
                buttonVariant="border-with-text"
              />
            </div>
            <div className="h-7">
              <MemberDropdown
                projectId={projectId}
                value={state.assigneeIds}
                onChange={(assigneeIds) => setState((prev) => ({ ...prev, assigneeIds }))}
                buttonVariant={state.assigneeIds.length > 0 ? "transparent-without-text" : "border-with-text"}
                placeholder="Assignees"
                multiple
              />
            </div>
            <div className="h-7">
              <IssueLabelSelect
                value={state.labelIds}
                onChange={(labelIds) => setState((prev) => ({ ...prev, labelIds }))}
                projectId={projectId}
              />
            </div>
            {areEstimateEnabledByProjectId(projectId) && (
              <div className="h-7">
                <EstimateDropdown
                  value={state.estimatePointId}
                  onChange={(estimatePointId) => setState((prev) => ({ ...prev, estimatePointId }))}
                  projectId={projectId}
                  buttonVariant="border-with-text"
                  placeholder="Estimate"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-subtle p-3">
            <h5 className="text-13 font-medium text-secondary">Recurrence</h5>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-13 text-tertiary">Repeats</span>
              <CustomSelect
                value={state.frequency}
                label={
                  state.frequency
                    ? FREQUENCY_OPTIONS.find((o) => o.value === state.frequency)?.label
                    : "Select frequency"
                }
                onChange={(value: TRecurringIssueFrequency) => setState((prev) => ({ ...prev, frequency: value }))}
                input
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <CustomSelect.Option key={option.value} value={option.value}>
                    {option.label}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
              {state.frequency && (
                <>
                  <span className="text-13 text-tertiary">every</span>
                  <Input
                    type="number"
                    min={1}
                    inputSize="sm"
                    className="w-16"
                    value={state.interval}
                    onChange={(event) =>
                      setState((prev) => ({ ...prev, interval: Math.max(1, Number(event.target.value) || 1) }))
                    }
                  />
                  <span className="text-13 text-tertiary">
                    {state.frequency === "DAILY" && "day(s)"}
                    {state.frequency === "WEEKLY" && "week(s)"}
                    {state.frequency === "MONTHLY" && "month(s)"}
                    {state.frequency === "YEARLY" && "year(s)"}
                  </span>
                </>
              )}
            </div>

            {state.frequency === "WEEKLY" && (
              <div className="flex flex-col gap-1">
                <WeekdayPicker
                  value={state.weekdays}
                  onChange={(weekdays) => setState((prev) => ({ ...prev, weekdays }))}
                />
                <p className="text-caption-sm-regular text-tertiary">
                  If no days are selected, occurrences repeat on the same weekday as the start date.
                </p>
              </div>
            )}

            {(state.frequency === "MONTHLY" || state.frequency === "YEARLY") && (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-13 text-tertiary">On day</span>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    inputSize="sm"
                    className="w-16"
                    value={state.dayOfMonth ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        dayOfMonth: event.target.value ? Number(event.target.value) : null,
                      }))
                    }
                  />
                  <span className="text-13 text-tertiary">of the month</span>
                  {state.frequency === "YEARLY" && (
                    <CustomSelect
                      value={state.monthOfYear}
                      label={MONTH_OPTIONS.find((o) => o.value === state.monthOfYear)?.label ?? "Select month"}
                      onChange={(value: number) => setState((prev) => ({ ...prev, monthOfYear: value }))}
                      input
                    >
                      {MONTH_OPTIONS.map((option) => (
                        <CustomSelect.Option key={option.value} value={option.value}>
                          {option.label}
                        </CustomSelect.Option>
                      ))}
                    </CustomSelect>
                  )}
                </div>
                <p className="text-caption-sm-regular text-tertiary">
                  Days 29-31 aren&apos;t available in every month - if the chosen day doesn&apos;t exist in a given
                  month, the occurrence is generated on that month&apos;s last day instead.
                </p>
              </div>
            )}

            {state.frequency && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-caption-sm-regular text-tertiary">Start date</span>
                  <DateDropdown
                    value={state.startDate}
                    onChange={(date) =>
                      setState((prev) => ({
                        ...prev,
                        startDate: date ? (renderFormattedPayloadDate(date) ?? null) : null,
                      }))
                    }
                    buttonVariant="border-with-text"
                    placeholder="Start date"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-caption-sm-regular text-tertiary">End date (optional)</span>
                  <DateDropdown
                    value={state.endDate}
                    onChange={(date) =>
                      setState((prev) => ({
                        ...prev,
                        endDate: date ? (renderFormattedPayloadDate(date) ?? null) : null,
                      }))
                    }
                    buttonVariant="border-with-text"
                    minDate={minEndDate}
                    placeholder="No end date"
                    isClearable
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-caption-sm-regular text-tertiary">Max occurrences (optional)</span>
                  <Input
                    type="number"
                    min={1}
                    inputSize="sm"
                    className="w-24"
                    value={state.maxOccurrences ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        maxOccurrences: event.target.value ? Number(event.target.value) : null,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-caption-sm-regular text-tertiary">Timezone</span>
                  <TimezoneSelect
                    value={state.timezone}
                    onChange={(timezone) => setState((prev) => ({ ...prev, timezone }))}
                  />
                </div>
              </div>
            )}
          </div>

          <Tooltip
            tooltipContent="Set a frequency and a start date before activating this template."
            disabled={canActivate}
          >
            <label
              htmlFor="recurring-template-is-active"
              className={`flex w-fit items-center gap-1.5 text-13 text-secondary ${
                canActivate ? "" : "cursor-not-allowed opacity-60"
              }`}
            >
              <Checkbox
                id="recurring-template-is-active"
                checked={state.isActive}
                disabled={!canActivate}
                onChange={(event) => setState((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Active
            </label>
          </Tooltip>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
            Save
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
