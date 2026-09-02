/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Plus, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type {
  TWorkflowTransitionActionConfigAssignMember,
  TWorkflowTransitionActionConfigSystemComment,
  TWorkflowTransitionActionType,
} from "@plane/types";
import { Button, CustomSelect } from "@plane/ui";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// components (cross-feature reuse - see comment below)
import { TemplateTokenTextarea } from "@/components/automations/workflow-rules/template-token-textarea";
// local imports
import { ACTION_TYPE_LABELS, ACTION_TYPE_OPTIONS, MAX_ACTIONS_PER_TRANSITION } from "./constants";
import { SingleLabelPicker } from "./single-label-picker";
import type { TLocalWorkflowTransitionAction } from "./types";

type Props = {
  projectId: string;
  actions: TLocalWorkflowTransitionAction[];
  onChange: (actions: TLocalWorkflowTransitionAction[]) => void;
};

const emptyAction = (sortOrder: number): TLocalWorkflowTransitionAction => ({
  action_type: "SYSTEM_COMMENT",
  config: {},
  sort_order: sortOrder,
  _key: `local-action-${Date.now()}-${sortOrder}`,
});

/**
 * Ordered post-transition actions - exigence 9 of
 * docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
 * multi-etats avec approbations") in plane-selfhost, run in `sort_order`
 * after an allowed transition (see
 * apps/api/plane/utils/workflow_transition_engine.py::_execute_transition_actions).
 * Reorder is a plain move-up/move-down pair rather than the sibling
 * workflow-rules feature's full pragmatic-drag-and-drop `ActionItem` - a
 * transition caps at `MAX_ACTIONS_PER_TRANSITION` (5), too short a list for
 * drag-and-drop machinery to earn its complexity.
 *
 * `TemplateTokenTextarea` is imported directly from the sibling
 * `automations/workflow-rules` feature rather than duplicated - it is a
 * fully generic `{{issue.identifier}}`/`{{issue.title}}`/
 * `{{actor.display_name}}` token-insertion textarea with no coupling to
 * `TWorkflowRule` types, and this feature's own `SYSTEM_COMMENT` action
 * resolves the exact same three tokens (see
 * `_resolve_template` in workflow_transition_engine.py, which mirrors
 * workflow_rule_engine.py's own function of the same name verbatim).
 */
export function ActionList(props: Props) {
  const { projectId, actions, onChange } = props;
  const { t } = useTranslation();

  const updateAction = (index: number, patch: Partial<TLocalWorkflowTransitionAction>) => {
    onChange(actions.map((action, i) => (i === index ? Object.assign({}, action, patch) : action)));
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index).map((action, i) => Object.assign({}, action, { sort_order: i })));
  };

  const moveAction = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= actions.length) return;
    const reordered = [...actions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(destination, 0, moved);
    onChange(reordered.map((action, i) => Object.assign({}, action, { sort_order: i })));
  };

  const addAction = () => onChange([...actions, emptyAction(actions.length)]);

  const atCapacity = actions.length >= MAX_ACTIONS_PER_TRANSITION;

  return (
    <div className="flex flex-col gap-2">
      <h5 className="text-13 font-medium text-secondary">{t("governed_workflows.actions.heading")}</h5>
      {actions.length === 0 && <p className="text-12 text-tertiary">{t("governed_workflows.actions.empty_state")}</p>}
      {actions.map((action, index) => (
        <div key={action._key} className="flex flex-col gap-2 rounded-md border border-subtle p-2">
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveAction(index, -1)}
                className="text-tertiary hover:text-secondary disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={index === actions.length - 1}
                onClick={() => moveAction(index, 1)}
                className="text-tertiary hover:text-secondary disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <span className="shrink-0 text-12 text-tertiary">{index + 1}.</span>
            <CustomSelect
              value={action.action_type}
              label={ACTION_TYPE_LABELS[action.action_type]}
              onChange={(value: TWorkflowTransitionActionType) =>
                updateAction(index, { action_type: value, config: {} })
              }
              input
            >
              {ACTION_TYPE_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
            <button
              type="button"
              onClick={() => removeAction(index)}
              className="ml-auto shrink-0 rounded-sm p-1 text-tertiary hover:bg-layer-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="pl-8">
            {action.action_type === "SYSTEM_COMMENT" && (
              <TemplateTokenTextarea
                value={(action.config as TWorkflowTransitionActionConfigSystemComment).comment_template ?? ""}
                onChange={(value) => updateAction(index, { config: { comment_template: value } })}
              />
            )}
            {(action.action_type === "ADD_LABEL" || action.action_type === "REMOVE_LABEL") && (
              <SingleLabelPicker
                projectId={projectId}
                labelId={(action.config as { label_id?: string }).label_id}
                onChange={(labelId) => updateAction(index, { config: { label_id: labelId ?? "" } })}
              />
            )}
            {action.action_type === "ASSIGN_MEMBER" && (
              <MemberDropdown
                projectId={projectId}
                multiple={false}
                value={(action.config as TWorkflowTransitionActionConfigAssignMember).member_id ?? null}
                onChange={(value) => updateAction(index, { config: { member_id: value ?? "" } })}
                buttonVariant="border-with-text"
                placeholder={t("governed_workflows.actions.choose_member")}
              />
            )}
            {(action.action_type === "WEBHOOK" ||
              action.action_type === "NOTIFY_ASSIGNEE" ||
              action.action_type === "NOTIFY_WATCHERS") && (
              <p className="text-11 text-tertiary">{t("governed_workflows.actions.no_config_needed")}</p>
            )}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          variant="link-primary"
          size="sm"
          className="w-fit"
          prependIcon={<Plus className="h-3.5 w-3.5" />}
          disabled={atCapacity}
          onClick={addAction}
        >
          {t("governed_workflows.actions.add_action")}
        </Button>
        {atCapacity && (
          <span className="text-11 text-tertiary">
            {t("governed_workflows.actions.max_reached", { max: MAX_ACTIONS_PER_TRANSITION })}
          </span>
        )}
      </div>
    </div>
  );
}
