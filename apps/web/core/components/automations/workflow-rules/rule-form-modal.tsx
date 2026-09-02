/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TWorkflowAction,
  TWorkflowRule,
  TWorkflowRuleCondition,
  TWorkflowRuleTriggerConfig,
  TWorkflowTriggerType,
} from "@plane/types";
import { Button, Checkbox, CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// services
import { WorkflowRuleService } from "@/services/workflow-rule.service";
// local imports
import { ActionList } from "./action-list";
import { ConditionList } from "./condition-list";
import {
  ERROR_MAX_ACTIONS,
  ERROR_ZERO_ACTIONS,
  MAX_ACTIONS_PER_RULE,
  TRIGGER_TYPE_LABELS,
  TRIGGER_TYPE_OPTIONS,
} from "./constants";
import { TriggerConfigForm } from "./trigger-config-form";
import type { TLocalWorkflowAction, TLocalWorkflowCondition } from "./types";

const workflowRuleService = new WorkflowRuleService();

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  rule: TWorkflowRule | null;
  onSaved: () => void;
};

const defaultState = () => ({
  name: "",
  description: "",
  isActive: true,
  triggerType: "ISSUE_CREATED" as TWorkflowTriggerType,
  triggerConfig: {} as TWorkflowRuleTriggerConfig,
  conditions: [] as TLocalWorkflowCondition[],
  actions: [] as TLocalWorkflowAction[],
});

/** Drops conditions left incomplete mid-edit (no value picked yet), and
 * strips the local-only `_key`, before submitting - `is_empty`/
 * `is_not_empty` need no value and are always kept. */
const sanitizeConditions = (conditions: TLocalWorkflowCondition[]): TWorkflowRuleCondition[] =>
  conditions
    .filter((condition) => {
      if (condition.operator === "is_empty" || condition.operator === "is_not_empty") return true;
      if (Array.isArray(condition.value)) return condition.value.length > 0;
      return !!condition.value;
    })
    .map((condition) => ({ field: condition.field, operator: condition.operator, value: condition.value }));

/**
 * Create/edit modal for a single workflow rule: trigger -> optional
 * trigger_config -> AND-combined conditions -> ordered actions. Mirrors the
 * structure (and, for validation/error handling, the exact conventions) of
 * the sibling `TriageRuleFormModal`
 * (apps/web/core/components/intake/triage-rules/rule-form-modal.tsx), the
 * pre-existing narrower rule builder for intake auto-triage.
 */
export function WorkflowRuleFormModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, rule, onSaved } = props;
  const { t } = useTranslation();
  const [state, setState] = useState(defaultState());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setState({
        name: rule.name,
        description: rule.description,
        isActive: rule.is_active,
        triggerType: rule.trigger_type,
        triggerConfig: rule.trigger_config ?? {},
        conditions: (rule.conditions ?? []).map((condition, index) =>
          Object.assign({}, condition, { _key: `condition-${index}-${condition.field}-${condition.operator}` })
        ),
        actions: (rule.actions ?? []).map((action, index) =>
          Object.assign({}, action, { _key: action.id ?? `local-action-${index}` })
        ),
      });
    } else {
      setState(defaultState());
    }
  }, [rule, isOpen]);

  const validate = (): string | null => {
    if (!state.name.trim()) return t("workflow_rules.form.name_required");
    if (state.actions.length === 0) return ERROR_ZERO_ACTIONS;
    if (state.actions.length > MAX_ACTIONS_PER_RULE) return ERROR_MAX_ACTIONS;
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: validationError });
      return;
    }

    const payload = {
      name: state.name.trim(),
      description: state.description.trim(),
      is_active: state.isActive,
      trigger_type: state.triggerType,
      trigger_config: state.triggerType === "STATE_CHANGED" ? state.triggerConfig : {},
      conditions: sanitizeConditions(state.conditions),
      actions: state.actions.map((action, index): TWorkflowAction => {
        const payloadAction: TWorkflowAction = {
          action_type: action.action_type,
          action_config: action.action_config,
          sort_order: index,
        };
        if (action.id) payloadAction.id = action.id;
        return payloadAction;
      }),
    };

    setIsSaving(true);
    try {
      if (rule) {
        await workflowRuleService.update(workspaceSlug, projectId, rule.id, payload);
      } else {
        await workflowRuleService.create(workspaceSlug, projectId, payload);
      }
      onSaved();
      handleClose();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? t("workflow_rules.form.save_error");
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto py-5">
        <div className="flex items-center justify-between px-5">
          <h4 className="text-18 font-medium text-primary">
            {rule ? t("workflow_rules.form.edit_rule") : t("workflow_rules.form.new_rule")}
          </h4>
          <button onClick={handleClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5">
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder={t("workflow_rules.form.rule_name_placeholder")}
              value={state.name}
              onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
              className="flex-1"
              inputSize="sm"
            />
            <label
              htmlFor="workflow-rule-is-active"
              className="flex shrink-0 items-center gap-1.5 text-13 text-secondary"
            >
              <Checkbox
                id="workflow-rule-is-active"
                checked={state.isActive}
                onChange={(event) => setState((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              {t("common.active")}
            </label>
          </div>

          <TextArea
            placeholder={t("workflow_rules.form.description_placeholder")}
            value={state.description}
            onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
            textAreaSize="sm"
            className="min-h-[50px] w-full"
          />

          <div className="flex flex-col gap-2">
            <h5 className="text-13 font-medium text-secondary">{t("workflow_rules.form.trigger")}</h5>
            <CustomSelect
              value={state.triggerType}
              label={TRIGGER_TYPE_LABELS[state.triggerType]}
              onChange={(value: TWorkflowTriggerType) =>
                setState((prev) => ({ ...prev, triggerType: value, triggerConfig: {} }))
              }
              input
            >
              {TRIGGER_TYPE_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
            {state.triggerType === "STATE_CHANGED" && (
              <TriggerConfigForm
                projectId={projectId}
                triggerConfig={state.triggerConfig}
                onChange={(triggerConfig) => setState((prev) => ({ ...prev, triggerConfig }))}
              />
            )}
          </div>

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
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
            {t("workflow_rules.form.save_rule")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
