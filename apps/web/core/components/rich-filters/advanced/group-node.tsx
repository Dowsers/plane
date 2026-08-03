/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { FolderPlus, Plus, Trash2 } from "lucide-react";
// plane imports
import { FILTER_TREE_MAX_CONDITIONS, FILTER_TREE_MAX_DEPTH } from "@plane/constants";
import { getButtonStyling } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterGroupNode, TFilterProperty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";
import { cn, isConditionNode, isGroupNode, toConditionForDisplay } from "@plane/utils";
// local imports
import { AddFilterDropdown } from "../add-filters/dropdown";
import { FilterItem } from "../filter-item/root";
import { GroupNegateToggle } from "./group-negate-toggle";
import { GroupOperatorChip } from "./group-operator-chip";
import { NodeMoveActions } from "./node-move-actions";

export type TFilterGroupProps<P extends TFilterProperty, E extends TExternalFilter> = {
  filter: IFilterInstance<P, E>;
  group: TFilterGroupNode<P>;
  /** Nesting depth of this group, root = 1. Mirrors the backend's depth accounting. */
  depth: number;
  /** The root group is never deletable and is rendered without its own outer margin. */
  isRoot?: boolean;
  isDisabled?: boolean;
};

/**
 * Recursively renders one group node of the advanced (nested AND/OR/NOT) filter tree: a bordered
 * box containing a header (negate toggle, AND/OR toggle, "+ Condition"/"+ Group"/delete actions)
 * and its children - each child is either a leaf condition (rendered via the existing `FilterItem`,
 * reused as-is) or another nested `FilterGroup`. Depth and total-condition caps are enforced here
 * purely as a client-side UX guard (disabling "+ Group"/"+ Condition" with an explanatory tooltip);
 * the API remains the actual source of truth and re-validates independently on save/query.
 */
export const FilterGroup = observer(function FilterGroup<P extends TFilterProperty, E extends TExternalFilter>(
  props: TFilterGroupProps<P, E>
) {
  const { filter, group, depth, isRoot = false, isDisabled = false } = props;

  const totalConditionCount = filter.allConditions.length;
  const canAddCondition = totalConditionCount < FILTER_TREE_MAX_CONDITIONS;
  const canAddGroup = depth < FILTER_TREE_MAX_DEPTH;

  const handleAddCondition = (property: P, operator: TSupportedOperators, isNegation: boolean) => {
    filter.addConditionToGroup(group.id, { property, operator, value: undefined }, isNegation);
  };

  const handleAddGroup = () => {
    filter.addGroup(group.id, LOGICAL_OPERATOR.AND);
  };

  const showActions = !isDisabled;

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-md border border-subtle-1 bg-layer-1 p-2", {
        "border-dashed border-danger-subtle": !!group.negate,
      })}
    >
      {/* Group header: negate toggle, AND/OR toggle, level-scoped actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        <GroupNegateToggle
          isNegated={!!group.negate}
          onToggle={showActions ? () => filter.toggleGroupNegate(group.id) : undefined}
          isDisabled={isDisabled}
        />
        <GroupOperatorChip
          logicalOperator={group.logicalOperator}
          onToggle={showActions ? () => filter.toggleGroupOperator(group.id) : undefined}
          isDisabled={isDisabled}
        />
        {group.children.length === 0 && (
          <span className="text-11 text-placeholder italic">Empty group - add a condition or remove it</span>
        )}

        {showActions && (
          <div className="ml-auto flex items-center gap-1">
            {canAddCondition ? (
              <AddFilterDropdown
                filter={filter}
                handleFilterSelect={handleAddCondition}
                customButton={
                  <span className={cn(getButtonStyling("secondary", "sm"), "gap-1")}>
                    <Plus className="size-3" />
                    Condition
                  </span>
                }
              />
            ) : (
              // Deliberately NOT `AddFilterDropdown` with `buttonConfig.isDisabled` here:
              // `CustomSearchSelect`'s custom-button click handler opens the panel regardless of
              // its `disabled` prop (only headlessui's own Combobox interactions are gated), so the
              // condition cap must be enforced by not rendering the dropdown at all once reached.
              <Tooltip tooltipContent={`Maximum of ${FILTER_TREE_MAX_CONDITIONS} conditions reached`} position="top">
                <span className={cn(getButtonStyling("secondary", "sm"), "cursor-not-allowed gap-1 opacity-50")}>
                  <Plus className="size-3" />
                  Condition
                </span>
              </Tooltip>
            )}
            <Tooltip
              tooltipContent={`Maximum nesting depth of ${FILTER_TREE_MAX_DEPTH} reached`}
              disabled={canAddGroup}
              position="top"
            >
              <div>
                <button
                  type="button"
                  disabled={!canAddGroup}
                  onClick={handleAddGroup}
                  className={cn(getButtonStyling("secondary", "sm"), "gap-1")}
                >
                  <FolderPlus className="size-3" />
                  Group
                </button>
              </div>
            </Tooltip>
            {!isRoot && (
              <IconButton
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => filter.removeGroup(group.id)}
                aria-label="Remove group"
              />
            )}
          </div>
        )}
      </div>

      {/* Group children */}
      <div className="flex flex-col gap-1.5 pl-2">
        {group.children.map((child, index) => (
          <div key={child.id} className="flex flex-col gap-1.5">
            {index > 0 && (
              <div>
                <GroupOperatorChip
                  logicalOperator={group.logicalOperator}
                  onToggle={showActions ? () => filter.toggleGroupOperator(group.id) : undefined}
                  isDisabled={isDisabled}
                />
              </div>
            )}
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                {isConditionNode(child) ? (
                  <FilterItem filter={filter} condition={toConditionForDisplay(child)} isDisabled={isDisabled} />
                ) : isGroupNode(child) ? (
                  <FilterGroup filter={filter} group={child} depth={depth + 1} isDisabled={isDisabled} />
                ) : null}
              </div>
              {showActions && (
                <NodeMoveActions filter={filter} nodeId={child.id} index={index} siblingCount={group.children.length} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
