/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Plus, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssuePriorities, TTriageRule, TTriageRuleAction, TTriageRuleCondition } from "@plane/types";
import { Button, Checkbox, CustomSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// components
import { LabelDropdown } from "@/components/issues/issue-layouts/properties/label-dropdown";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// services
import { TriageRuleService } from "@/services/inbox";

const triageRuleService = new TriageRuleService();

const MAX_CONDITIONS = 5;
const MAX_ACTIONS = 5;

let localKeyCounter = 0;
const nextLocalKey = () => `local-${(localKeyCounter += 1)}`;

type TLocalCondition = TTriageRuleCondition & { _key: string };
type TLocalAction = TTriageRuleAction & { _key: string };

const emptyCondition = (): TLocalCondition => ({
  field: "TITLE",
  operator: "CONTAINS",
  value: "",
  case_sensitive: false,
  _key: nextLocalKey(),
});

const emptyAction = (): TLocalAction => ({
  action_type: "SET_PRIORITY",
  priority: null,
  state: null,
  labels: [],
  assignees: [],
  _key: nextLocalKey(),
});

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  rule: TTriageRule | null;
  onSaved: () => void;
};

export const TriageRuleFormModal = observer(function TriageRuleFormModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, rule, onSaved } = props;
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [conditions, setConditions] = useState<TLocalCondition[]>([emptyCondition()]);
  const [actions, setActions] = useState<TLocalAction[]>([emptyAction()]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setIsActive(rule.is_active);
      setConditions(
        rule.conditions.length
          ? rule.conditions.map((c) => ({ ...c, _key: c.id ?? nextLocalKey() }))
          : [emptyCondition()]
      );
      setActions(
        rule.actions.length ? rule.actions.map((a) => ({ ...a, _key: a.id ?? nextLocalKey() })) : [emptyAction()]
      );
    } else {
      setName("");
      setIsActive(true);
      setConditions([emptyCondition()]);
      setActions([emptyAction()]);
    }
  }, [rule, isOpen]);

  const updateCondition = (index: number, patch: Partial<TTriageRuleCondition>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const updateAction = (index: number, patch: Partial<TTriageRuleAction>) => {
    setActions(actions.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("intake_settings.triage_rules.form_modal.name_required"),
      });
      return;
    }
    const validConditions = conditions.filter((c) => c.value.trim().length > 0);
    if (validConditions.length === 0) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("intake_settings.triage_rules.form_modal.condition_required"),
      });
      return;
    }

    const payload = {
      name: name.trim(),
      is_active: isActive,
      conditions: validConditions,
      actions,
    };

    setIsSaving(true);
    try {
      if (rule) {
        await triageRuleService.update(workspaceSlug, projectId, rule.id, payload);
      } else {
        await triageRuleService.create(workspaceSlug, projectId, payload);
      }
      onSaved();
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? t("intake_settings.triage_rules.form_modal.save_error"),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto py-5">
        <div className="flex items-center justify-between px-5">
          <h4 className="text-18 font-medium text-primary">
            {rule
              ? t("intake_settings.triage_rules.form_modal.title_edit")
              : t("intake_settings.triage_rules.list.new_rule")}
          </h4>
          <button onClick={handleClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5">
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder={t("intake_settings.triage_rules.form_modal.name_placeholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
              inputSize="sm"
            />
            <label htmlFor="triage-rule-is-active" className="flex items-center gap-1.5 text-13 text-secondary">
              <Checkbox id="triage-rule-is-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {t("intake_settings.triage_rules.form_modal.active")}
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <h5 className="text-13 font-medium text-secondary">
              {t("intake_settings.triage_rules.form_modal.conditions_heading")}
            </h5>
            {conditions.map((condition, index) => (
              <div key={condition._key} className="flex items-center gap-2">
                <CustomSelect
                  value={condition.field}
                  label={
                    condition.field === "TITLE"
                      ? t("intake_settings.triage_rules.form_modal.field_title")
                      : t("description")
                  }
                  onChange={(val: TTriageRuleCondition["field"]) => updateCondition(index, { field: val })}
                  input
                >
                  <CustomSelect.Option value="TITLE">
                    {t("intake_settings.triage_rules.form_modal.field_title")}
                  </CustomSelect.Option>
                  <CustomSelect.Option value="DESCRIPTION">{t("description")}</CustomSelect.Option>
                </CustomSelect>
                <CustomSelect
                  value={condition.operator}
                  label={condition.operator}
                  onChange={(val: TTriageRuleCondition["operator"]) => updateCondition(index, { operator: val })}
                  input
                >
                  <CustomSelect.Option value="CONTAINS">
                    {t("intake_settings.triage_rules.form_modal.operator_contains")}
                  </CustomSelect.Option>
                  <CustomSelect.Option value="NOT_CONTAINS">
                    {t("intake_settings.triage_rules.form_modal.operator_not_contains")}
                  </CustomSelect.Option>
                  <CustomSelect.Option value="STARTS_WITH">
                    {t("intake_settings.triage_rules.form_modal.operator_starts_with")}
                  </CustomSelect.Option>
                  <CustomSelect.Option value="REGEX">
                    {t("intake_settings.triage_rules.form_modal.operator_regex")}
                  </CustomSelect.Option>
                </CustomSelect>
                <Input
                  type="text"
                  placeholder={t("intake_settings.triage_rules.form_modal.value_placeholder")}
                  value={condition.value}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  className="flex-1"
                  inputSize="sm"
                />
                <button
                  type="button"
                  onClick={() => setConditions(conditions.filter((_, i) => i !== index))}
                  disabled={conditions.length === 1}
                  className="rounded-sm p-1 hover:bg-layer-1 disabled:opacity-30"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button
              variant="link-primary"
              size="sm"
              className="w-fit"
              prependIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setConditions([...conditions, emptyCondition()])}
              disabled={conditions.length >= MAX_CONDITIONS}
            >
              {t("intake_settings.triage_rules.form_modal.add_condition")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <h5 className="text-13 font-medium text-secondary">
              {t("intake_settings.triage_rules.form_modal.actions_heading")}
            </h5>
            {actions.map((action, index) => (
              <div key={action._key} className="flex items-center gap-2">
                <CustomSelect
                  value={action.action_type}
                  label={
                    {
                      SET_PRIORITY: t("intake_settings.triage_rules.form_modal.action_set_priority"),
                      SET_LABELS: t("intake_settings.triage_rules.form_modal.action_set_labels"),
                      SET_ASSIGNEES: t("intake_settings.triage_rules.form_modal.action_set_assignees"),
                      SET_STATE: t("intake_settings.triage_rules.form_modal.action_set_state"),
                    }[action.action_type]
                  }
                  onChange={(val: TTriageRuleAction["action_type"]) => updateAction(index, { action_type: val })}
                  input
                >
                  <CustomSelect.Option value="SET_PRIORITY">
                    {t("intake_settings.triage_rules.form_modal.action_set_priority")}
                  </CustomSelect.Option>
                  <CustomSelect.Option value="SET_LABELS">
                    {t("intake_settings.triage_rules.form_modal.action_set_labels")}
                  </CustomSelect.Option>
                  <CustomSelect.Option value="SET_ASSIGNEES">
                    {t("intake_settings.triage_rules.form_modal.action_set_assignees")}
                  </CustomSelect.Option>
                  <CustomSelect.Option value="SET_STATE">
                    {t("intake_settings.triage_rules.form_modal.action_set_state")}
                  </CustomSelect.Option>
                </CustomSelect>

                <div className="flex-1">
                  {action.action_type === "SET_PRIORITY" && (
                    <PriorityDropdown
                      value={(action.priority as TIssuePriorities) ?? "none"}
                      onChange={(val) => updateAction(index, { priority: val })}
                      buttonVariant="border-with-text"
                    />
                  )}
                  {action.action_type === "SET_STATE" && (
                    <StateDropdown
                      projectId={projectId}
                      value={action.state}
                      onChange={(val) => updateAction(index, { state: val })}
                      buttonVariant="border-with-text"
                    />
                  )}
                  {action.action_type === "SET_LABELS" && (
                    <LabelDropdown
                      projectId={projectId}
                      value={action.labels}
                      onChange={(val) => updateAction(index, { labels: val })}
                      label={
                        <span>
                          {action.labels.length > 0
                            ? t("intake_settings.forms.form_modal.label_count", { count: action.labels.length })
                            : t("intake_settings.triage_rules.form_modal.choose_labels")}
                        </span>
                      }
                    />
                  )}
                  {action.action_type === "SET_ASSIGNEES" && (
                    <MemberDropdown
                      projectId={projectId}
                      multiple
                      value={action.assignees}
                      onChange={(val) => updateAction(index, { assignees: val })}
                      buttonVariant="border-with-text"
                      placeholder={t("intake_settings.triage_rules.form_modal.choose_members")}
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActions(actions.filter((_, i) => i !== index))}
                  disabled={actions.length === 1}
                  className="rounded-sm p-1 hover:bg-layer-1 disabled:opacity-30"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button
              variant="link-primary"
              size="sm"
              className="w-fit"
              prependIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setActions([...actions, emptyAction()])}
              disabled={actions.length >= MAX_ACTIONS}
            >
              {t("intake_settings.triage_rules.form_modal.add_action")}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
            {t("save")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
