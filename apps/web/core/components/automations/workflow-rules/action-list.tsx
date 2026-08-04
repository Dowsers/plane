/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Plus } from "lucide-react";
// plane imports
import type { TWorkflowActionType } from "@plane/types";
import { Button, CustomSelect } from "@plane/ui";
// local imports
import { ActionItem } from "./action-item";
import { ACTION_TYPE_LABELS, ACTION_TYPE_OPTIONS, MAX_ACTIONS_PER_RULE } from "./constants";
import type { TLocalWorkflowAction } from "./types";

type Props = {
  projectId: string;
  actions: TLocalWorkflowAction[];
  onChange: (actions: TLocalWorkflowAction[]) => void;
};

/**
 * Ordered, drag-reorderable action list - "ALORS" (then) half of a
 * workflow rule. A rule must have at least one action and at most
 * `MAX_ACTIONS_PER_RULE` (both backend-enforced, see ./constants.ts) - the
 * "add action" control disables itself at the cap; the zero-action case is
 * validated at submit time in `rule-form-modal.tsx`, not here, since an
 * empty list is a normal, if incomplete, intermediate editing state.
 */
export function ActionList(props: Props) {
  const { projectId, actions, onChange } = props;

  const moveAction = (sourceIndex: number, destinationIndex: number) => {
    if (sourceIndex === destinationIndex) return;
    const reordered = [...actions];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(destinationIndex, 0, moved);
    onChange(reordered.map((action, index) => Object.assign({}, action, { sort_order: index })));
  };

  const updateAction = (index: number, patch: Partial<TLocalWorkflowAction>) => {
    onChange(actions.map((action, i) => (i === index ? Object.assign({}, action, patch) : action)));
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index).map((action, i) => Object.assign({}, action, { sort_order: i })));
  };

  const addAction = (actionType: TWorkflowActionType) => {
    onChange([
      ...actions,
      {
        action_type: actionType,
        action_config: {},
        sort_order: actions.length,
        _key: `local-action-${Date.now()}-${actions.length}`,
      },
    ]);
  };

  const atCapacity = actions.length >= MAX_ACTIONS_PER_RULE;

  return (
    <div className="flex flex-col gap-2">
      <h5 className="text-13 font-medium text-secondary">Actions (run in order)</h5>
      {actions.map((action, index) => (
        <ActionItem
          key={action._key}
          projectId={projectId}
          action={action}
          index={index}
          isLast={index === actions.length - 1}
          onChange={(patch) => updateAction(index, patch)}
          onRemove={() => removeAction(index)}
          onMove={moveAction}
        />
      ))}
      <div className="flex items-center gap-2">
        <CustomSelect
          customButton={
            <Button
              variant="link-primary"
              size="sm"
              className="w-fit"
              prependIcon={<Plus className="h-3.5 w-3.5" />}
              disabled={atCapacity}
            >
              Add action
            </Button>
          }
          value={null}
          onChange={(value: TWorkflowActionType) => addAction(value)}
          disabled={atCapacity}
        >
          {ACTION_TYPE_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.value} value={option.value}>
              {ACTION_TYPE_LABELS[option.value]}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
        {atCapacity && (
          <span className="text-11 text-tertiary">Maximum of {MAX_ACTIONS_PER_RULE} actions reached.</span>
        )}
      </div>
    </div>
  );
}
