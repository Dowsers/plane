/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { ISSUE_PRIORITIES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TDashboardChartAxisField,
  TDashboardChartYAxisField,
  TDashboardKpiMetric,
  TDashboardTableDueDateFilter,
  TDashboardWidget,
  TDashboardWidgetConfig,
  TDashboardWidgetType,
  TIssuePriorities,
} from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// components
import { ProjectSelect } from "@/components/analytics/select/project";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// local imports
import { DashboardAxisSelect } from "./selects/axis-select";
import { DashboardGenericMultiSelect } from "./selects/generic-multi-select";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  dashboardId: string;
  /** When set, edits this widget instead of creating a new one - the
   * widget's own `widget_type` is fixed (not switchable) while editing. */
  widget?: TDashboardWidget | null;
};

const CHART_AXIS_FIELDS: TDashboardChartAxisField[] = [
  "state_id",
  "state__group",
  "labels__id",
  "assignees__id",
  "estimate_point__value",
  "issue_cycle__cycle_id",
  "issue_module__module_id",
  "priority",
  "start_date",
  "target_date",
  "created_at",
  "completed_at",
];

const CHART_Y_AXIS_FIELDS: TDashboardChartYAxisField[] = ["issue_count", "estimate"];

const KPI_METRICS: TDashboardKpiMetric[] = ["total_open_issues", "completion_rate", "overdue_issues", "total_issues"];

const DUE_DATE_FILTERS: TDashboardTableDueDateFilter[] = ["overdue", "due_today", "no_due_date"];

const WIDGET_TYPES: TDashboardWidgetType[] = ["chart", "kpi", "table"];

type TFormState = {
  title: string;
  project_ids: string[];
  x_axis: TDashboardChartAxisField;
  y_axis: TDashboardChartYAxisField;
  segment: TDashboardChartAxisField | null;
  metric: TDashboardKpiMetric;
  state_ids: string[];
  assignee_ids: string[];
  label_ids: string[];
  priority: TIssuePriorities[];
  due_date_filter: TDashboardTableDueDateFilter | null;
};

const DEFAULT_FORM: TFormState = {
  title: "",
  project_ids: [],
  x_axis: "state_id",
  y_axis: "issue_count",
  segment: null,
  metric: "total_open_issues",
  state_ids: [],
  assignee_ids: [],
  label_ids: [],
  priority: [],
  due_date_filter: null,
};

function formStateFromWidget(widget: TDashboardWidget): TFormState {
  if (widget.widget_type === "chart") {
    return {
      ...DEFAULT_FORM,
      title: widget.title,
      project_ids: widget.project_ids,
      x_axis: widget.config.x_axis,
      y_axis: widget.config.y_axis,
      segment: widget.config.segment ?? null,
    };
  }
  if (widget.widget_type === "kpi") {
    return { ...DEFAULT_FORM, title: widget.title, project_ids: widget.project_ids, metric: widget.config.metric };
  }
  return {
    ...DEFAULT_FORM,
    title: widget.title,
    project_ids: widget.project_ids,
    state_ids: widget.config.state_ids ?? [],
    assignee_ids: widget.config.assignee_ids ?? [],
    label_ids: widget.config.label_ids ?? [],
    priority: widget.config.priority ?? [],
    due_date_filter: widget.config.due_date_filter ?? null,
  };
}

export const AddEditWidgetModal = observer(function AddEditWidgetModal(props: Props) {
  const { isOpen, handleClose, dashboardId, widget } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { createWidget, updateWidget } = useCustomDashboard();
  const { workspaceProjectIds } = useProject();
  const { workspaceStates, fetchWorkspaceStates } = useProjectState();
  const { workspaceLabels, fetchWorkspaceLabels } = useLabel();
  const {
    getUserDetails,
    workspace: { workspaceMemberIds, fetchWorkspaceMembers },
  } = useMember();

  const [widgetType, setWidgetType] = useState<TDashboardWidgetType>(widget?.widget_type ?? "chart");
  const [form, setForm] = useState<TFormState>(widget ? formStateFromWidget(widget) : DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setWidgetType(widget?.widget_type ?? "chart");
    setForm(widget ? formStateFromWidget(widget) : DEFAULT_FORM);
  }, [isOpen, widget]);

  useSWR(
    workspaceSlug && isOpen ? ["DASHBOARD_WIDGET_FORM_STATES", workspaceSlug] : null,
    workspaceSlug && isOpen ? () => fetchWorkspaceStates(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    workspaceSlug && isOpen ? ["DASHBOARD_WIDGET_FORM_LABELS", workspaceSlug] : null,
    workspaceSlug && isOpen ? () => fetchWorkspaceLabels(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    workspaceSlug && isOpen ? ["DASHBOARD_WIDGET_FORM_MEMBERS", workspaceSlug] : null,
    workspaceSlug && isOpen ? () => fetchWorkspaceMembers(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const onClose = () => {
    handleClose();
    setForm(DEFAULT_FORM);
  };

  const chartFieldLabel = (field: TDashboardChartAxisField) => t(`workspace_dashboards.widget.chart.fields.${field}`);

  const scopedStateOptions = (workspaceStates ?? []).filter(
    (state) => form.project_ids.length === 0 || form.project_ids.includes(state.project_id)
  );
  const scopedLabelOptions = (workspaceLabels ?? []).filter(
    (label) => form.project_ids.length === 0 || form.project_ids.includes(label.project_id)
  );

  const handleSubmit = async () => {
    if (!workspaceSlug) return;
    if (!form.title.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("workspace_dashboards.widget.title_placeholder"),
      });
      return;
    }
    if (form.project_ids.length === 0) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("workspace_dashboards.widget.projects_placeholder"),
      });
      return;
    }

    let config: TDashboardWidgetConfig;
    if (widgetType === "chart") {
      config = {
        x_axis: form.x_axis,
        y_axis: form.y_axis,
        segment: form.segment && form.segment !== form.x_axis ? form.segment : null,
      };
    } else if (widgetType === "kpi") {
      config = { metric: form.metric };
    } else {
      config = {
        ...(form.state_ids.length > 0 ? { state_ids: form.state_ids } : {}),
        ...(form.assignee_ids.length > 0 ? { assignee_ids: form.assignee_ids } : {}),
        ...(form.label_ids.length > 0 ? { label_ids: form.label_ids } : {}),
        ...(form.priority.length > 0 ? { priority: form.priority } : {}),
        ...(form.due_date_filter ? { due_date_filter: form.due_date_filter } : {}),
      };
    }

    setIsSubmitting(true);
    try {
      if (widget) {
        await updateWidget(workspaceSlug.toString(), dashboardId, widget.id, {
          title: form.title.trim(),
          project_ids: form.project_ids,
          config,
        });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("workspace_dashboards.toast.update_success"),
        });
      } else {
        await createWidget(workspaceSlug.toString(), dashboardId, {
          widget_type: widgetType,
          title: form.title.trim(),
          project_ids: form.project_ids,
          config,
        });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("workspace_dashboards.toast.create_success"),
        });
      }
      onClose();
    } catch (error: any) {
      const message = error?.error ?? t("workspace_dashboards.toast.error");
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto p-5">
        <h3 className="text-16 font-medium">
          {widget ? t("workspace_dashboards.widget.actions.edit") : t("workspace_dashboards.editor.add_widget")}
        </h3>

        {!widget && (
          <div className="flex items-center gap-2">
            {WIDGET_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setWidgetType(type)}
                className={`rounded-md border px-3 py-1.5 text-13 ${
                  widgetType === type
                    ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                    : "border-subtle text-secondary hover:bg-layer-1"
                }`}
              >
                {t(`workspace_dashboards.widget.types.${type}`)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-11 text-secondary">{t("workspace_dashboards.widget.title_label")}</span>
          <Input
            type="text"
            value={form.title}
            onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
            placeholder={t("workspace_dashboards.widget.title_placeholder")}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-11 text-secondary">{t("workspace_dashboards.widget.projects_label")}</span>
          <ProjectSelect
            value={form.project_ids}
            onChange={(val) => setForm((v) => ({ ...v, project_ids: val ?? [] }))}
            projectIds={workspaceProjectIds ?? []}
          />
        </div>

        {widgetType === "chart" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-11 text-secondary">{t("workspace_dashboards.widget.chart.x_axis")}</span>
              <DashboardAxisSelect
                value={form.x_axis}
                onChange={(val) => val && setForm((v) => ({ ...v, x_axis: val }))}
                options={CHART_AXIS_FIELDS.map((field) => ({ value: field, label: chartFieldLabel(field) }))}
                placeholder={t("workspace_dashboards.widget.chart.x_axis")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-11 text-secondary">{t("workspace_dashboards.widget.chart.y_axis")}</span>
              <DashboardAxisSelect
                value={form.y_axis}
                onChange={(val) => val && setForm((v) => ({ ...v, y_axis: val }))}
                options={CHART_Y_AXIS_FIELDS.map((field) => ({
                  value: field,
                  label: t(`workspace_dashboards.widget.chart.y_axis_fields.${field}`),
                }))}
                placeholder={t("workspace_dashboards.widget.chart.y_axis")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-11 text-secondary">{t("workspace_dashboards.widget.chart.segment")}</span>
              <DashboardAxisSelect
                value={form.segment}
                onChange={(val) => setForm((v) => ({ ...v, segment: val }))}
                options={CHART_AXIS_FIELDS.map((field) => ({ value: field, label: chartFieldLabel(field) }))}
                placeholder={t("workspace_dashboards.widget.chart.no_segment")}
                allowNoValue
                hiddenOptions={[form.x_axis]}
              />
            </div>
          </div>
        )}

        {widgetType === "kpi" && (
          <div className="flex flex-col gap-1">
            <span className="text-11 text-secondary">{t("workspace_dashboards.widget.kpi.metric_label")}</span>
            <DashboardAxisSelect
              value={form.metric}
              onChange={(val) => val && setForm((v) => ({ ...v, metric: val }))}
              options={KPI_METRICS.map((metric) => ({
                value: metric,
                label: t(`workspace_dashboards.widget.kpi.metrics.${metric}`),
              }))}
              placeholder={t("workspace_dashboards.widget.kpi.metric_label")}
            />
          </div>
        )}

        {widgetType === "table" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-11 text-secondary">{t("workspace_dashboards.widget.table.state_label")}</span>
              <DashboardGenericMultiSelect
                value={form.state_ids}
                onChange={(val) => setForm((v) => ({ ...v, state_ids: val }))}
                options={scopedStateOptions.map((state) => ({ value: state.id, label: state.name }))}
                placeholder={t("workspace_dashboards.widget.table.state_label")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-11 text-secondary">{t("workspace_dashboards.widget.table.assignee_label")}</span>
              <DashboardGenericMultiSelect
                value={form.assignee_ids}
                onChange={(val) => setForm((v) => ({ ...v, assignee_ids: val }))}
                options={(workspaceMemberIds ?? []).map((memberId) => ({
                  value: memberId,
                  label: getUserDetails(memberId)?.display_name ?? memberId,
                }))}
                placeholder={t("workspace_dashboards.widget.table.assignee_label")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-11 text-secondary">{t("workspace_dashboards.widget.table.label_label")}</span>
              <DashboardGenericMultiSelect
                value={form.label_ids}
                onChange={(val) => setForm((v) => ({ ...v, label_ids: val }))}
                options={scopedLabelOptions.map((label) => ({ value: label.id, label: label.name }))}
                placeholder={t("workspace_dashboards.widget.table.label_label")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-11 text-secondary">{t("workspace_dashboards.widget.table.priority_label")}</span>
              <DashboardGenericMultiSelect
                value={form.priority}
                onChange={(val) => setForm((v) => ({ ...v, priority: val as TIssuePriorities[] }))}
                options={ISSUE_PRIORITIES.map((priority) => ({ value: priority.key, label: priority.title }))}
                placeholder={t("workspace_dashboards.widget.table.priority_label")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-11 text-secondary">{t("workspace_dashboards.widget.table.due_date_label")}</span>
              <DashboardAxisSelect
                value={form.due_date_filter}
                onChange={(val) => setForm((v) => ({ ...v, due_date_filter: val }))}
                options={DUE_DATE_FILTERS.map((filter) => ({
                  value: filter,
                  label: t(`workspace_dashboards.widget.table.due_date_filters.${filter}`),
                }))}
                placeholder={t("workspace_dashboards.widget.table.due_date_label")}
                allowNoValue
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {widget ? t("update") : t("common.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
