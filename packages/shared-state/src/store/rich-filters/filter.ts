/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cloneDeep, isEqual } from "lodash-es";
import { action, computed, makeObservable, observable, toJS } from "mobx";
import { computedFn } from "mobx-utils";
import { v4 as uuidv4 } from "uuid";
// plane imports
import { DEFAULT_FILTER_VISIBILITY_OPTIONS, FILTER_TREE_MAX_CONDITIONS, FILTER_TREE_MAX_DEPTH } from "@plane/constants";
import type {
  TClearFilterOptions,
  TExpressionOptions,
  TFilterOptions,
  TSaveViewOptions,
  TUpdateViewOptions,
} from "@plane/constants";
import type {
  IFilterAdapter,
  SingleOrArray,
  TAllAvailableOperatorsForDisplay,
  TExternalFilter,
  TFilterConditionNode,
  TFilterConditionNodeForDisplay,
  TFilterConditionPayload,
  TFilterExpression,
  TFilterGroupNode,
  TFilterProperty,
  TFilterValue,
  TLogicalOperator,
  TSupportedOperators,
} from "@plane/types";
import { FILTER_NODE_TYPE, LOGICAL_OPERATOR, RELATIONAL_OPERATOR } from "@plane/types";
// local imports
import {
  createConditionNode,
  createGroupNode,
  deepCompareFilterExpressions,
  extractConditions,
  extractConditionsWithDisplayOperators,
  findConditionsByPropertyAndOperator,
  findNodeById,
  findParentChain,
  getDefaultValueForOperator,
  hasValidValue,
  isConditionNode,
  isGroupNode,
  removeNodeFromExpression,
  sanitizeAndStabilizeExpression,
  shouldNotifyChangeForExpression,
  updateNodeInExpression,
} from "@plane/utils";
import type { IFilterConfigManager } from "./config-manager";
import { FilterConfigManager } from "./config-manager";
import type { IFilterInstanceHelper } from "./filter-helpers";
import { FilterInstanceHelper } from "./filter-helpers";

/**
 * Interface for a filter instance.
 * Provides methods to manage the filter expression and notify changes.
 * - id: The id of the filter instance
 * - expression: The filter expression
 * - adapter: The filter adapter
 * - configManager: The filter config manager
 * - onExpressionChange: The callback to notify when the expression changes
 * - hasActiveFilters: Whether the filter instance has any active filters
 * - allConditions: All conditions in the filter expression
 * - allConditionsForDisplay: All conditions in the filter expression
 * - addCondition: Adds a condition to the filter expression
 * - updateConditionOperator: Updates the operator of a condition in the filter expression
 * - updateConditionValue: Updates the value of a condition in the filter expression
 * - removeCondition: Removes a condition from the filter expression
 * - clearFilters: Clears the filter expression
 * - ensureRootGroup: Normalizes the root of the expression into an explicit group node, so the
 *   advanced (nested AND/OR/NOT) tree-builder always has a stable group id to target - a no-op if
 *   the root is already a group
 * - addConditionToGroup: Adds a condition directly to a specific group, by id (advanced builder)
 * - addGroup: Adds a new (empty) nested group under a specific parent group, by id
 * - toggleGroupOperator: Flips a group's logical operator between AND and OR
 * - toggleGroupNegate: Flips a group's negation flag
 * - removeGroup: Removes a group (and its children) from the filter expression
 * - moveNode: Reorders a condition/group up or down among its siblings within the same parent group
 *   (v1 does not support moving a node into a *different* parent group - delete and re-add there
 *   instead; see the feature report for the "move" scope decision)
 * - duplicateNode: Duplicates a condition/group as a new sibling, with fresh ids throughout
 * @template P - The filter property type extending TFilterProperty
 * @template E - The external filter type extending TExternalFilter
 */
export interface IFilterInstance<P extends TFilterProperty, E extends TExternalFilter> {
  // observables
  id: string;
  initialFilterExpression: TFilterExpression<P> | null;
  expression: TFilterExpression<P> | null;
  adapter: IFilterAdapter<P, E>;
  configManager: IFilterConfigManager<P>;
  onExpressionChange?: (expression: E) => void;
  // computed
  hasActiveFilters: boolean;
  hasChanges: boolean;
  isVisible: boolean;
  allConditions: TFilterConditionNode<P, TFilterValue>[];
  allConditionsForDisplay: TFilterConditionNodeForDisplay<P, TFilterValue>[];
  // computed option helpers
  clearFilterOptions: TClearFilterOptions | undefined;
  saveViewOptions: TSaveViewOptions<E> | undefined;
  updateViewOptions: TUpdateViewOptions<E> | undefined;
  // computed permissions
  canClearFilters: boolean;
  canSaveView: boolean;
  canUpdateView: boolean;
  // visibility
  toggleVisibility: (isVisible?: boolean) => void;
  // filter expression actions
  resetExpression: (externalExpression: E, shouldResetInitialExpression?: boolean) => void;
  // filter condition
  findConditionsByPropertyAndOperator: (
    property: P,
    operator: TAllAvailableOperatorsForDisplay
  ) => TFilterConditionNodeForDisplay<P, TFilterValue>[];
  findFirstConditionByPropertyAndOperator: (
    property: P,
    operator: TAllAvailableOperatorsForDisplay
  ) => TFilterConditionNodeForDisplay<P, TFilterValue> | undefined;
  addCondition: <V extends TFilterValue>(
    groupOperator: TLogicalOperator,
    condition: TFilterConditionPayload<P, V>,
    isNegation: boolean
  ) => void;
  updateConditionProperty: (
    conditionId: string,
    property: P,
    operator: TSupportedOperators,
    isNegation: boolean
  ) => void;
  updateConditionOperator: (conditionId: string, operator: TSupportedOperators, isNegation: boolean) => void;
  updateConditionValue: <V extends TFilterValue>(
    conditionId: string,
    value: SingleOrArray<V>,
    forceUpdate?: boolean
  ) => void;
  removeCondition: (conditionId: string) => void;
  // group actions (advanced/nested AND-OR-NOT tree builder)
  ensureRootGroup: () => void;
  addConditionToGroup: <V extends TFilterValue>(
    groupId: string,
    condition: TFilterConditionPayload<P, V>,
    isNegation: boolean
  ) => void;
  addGroup: (parentGroupId: string, logicalOperator?: TLogicalOperator) => void;
  toggleGroupOperator: (groupId: string) => void;
  toggleGroupNegate: (groupId: string) => void;
  removeGroup: (groupId: string) => void;
  moveNode: (nodeId: string, direction: "up" | "down") => void;
  duplicateNode: (nodeId: string) => void;
  // config actions
  clearFilters: () => Promise<void>;
  saveView: () => Promise<void>;
  updateView: () => Promise<void>;
  // expression options actions
  updateExpressionOptions: (newOptions: Partial<TExpressionOptions<E>>) => void;
}

type TFilterParams<P extends TFilterProperty, E extends TExternalFilter> = {
  adapter: IFilterAdapter<P, E>;
  options?: Partial<TFilterOptions<E>>;
  initialExpression?: E;
  onExpressionChange?: (expression: E) => void;
};

export class FilterInstance<P extends TFilterProperty, E extends TExternalFilter> implements IFilterInstance<P, E> {
  // observables
  id: string;
  initialFilterExpression: TFilterExpression<P> | null;
  expression: TFilterExpression<P> | null;
  expressionOptions: TExpressionOptions<E>;
  adapter: IFilterAdapter<P, E>;
  configManager: IFilterConfigManager<P>;
  onExpressionChange?: (expression: E) => void;

  // helper instance
  private helper: IFilterInstanceHelper<P, E>;

  constructor(params: TFilterParams<P, E>) {
    this.id = uuidv4();
    this.adapter = params.adapter;
    this.helper = new FilterInstanceHelper<P, E>(this, {
      adapter: this.adapter,
    });
    this.configManager = new FilterConfigManager<P, E>(this, {
      options: params.options?.config,
    });
    // initialize expression
    const initialExpression = this.helper.initializeExpression(params.initialExpression);
    this.initialFilterExpression = cloneDeep(initialExpression);
    this.expression = cloneDeep(initialExpression);
    this.expressionOptions = this.helper.initializeExpressionOptions(params.options?.expression);
    this.onExpressionChange = params.onExpressionChange;
    this.helper.setInitialVisibility(params.options?.visibility ?? DEFAULT_FILTER_VISIBILITY_OPTIONS);

    makeObservable(this, {
      // observables
      id: observable,
      initialFilterExpression: observable,
      expression: observable,
      expressionOptions: observable.struct,
      adapter: observable,
      configManager: observable,
      // computed
      hasActiveFilters: computed,
      hasChanges: computed,
      isVisible: computed,
      allConditions: computed,
      allConditionsForDisplay: computed,
      // computed option helpers
      clearFilterOptions: computed,
      saveViewOptions: computed,
      updateViewOptions: computed,
      // computed permissions
      canClearFilters: computed,
      canSaveView: computed,
      canUpdateView: computed,
      // actions
      resetExpression: action,
      findConditionsByPropertyAndOperator: action,
      findFirstConditionByPropertyAndOperator: action,
      addCondition: action,
      updateConditionOperator: action,
      updateConditionValue: action,
      removeCondition: action,
      ensureRootGroup: action,
      addConditionToGroup: action,
      addGroup: action,
      toggleGroupOperator: action,
      toggleGroupNegate: action,
      removeGroup: action,
      moveNode: action,
      duplicateNode: action,
      clearFilters: action,
      saveView: action,
      updateView: action,
      updateExpressionOptions: action,
    });
  }

  // ------------ computed ------------

  /**
   * Checks if the filter instance has any active filters.
   * @returns True if the filter instance has any active filters, false otherwise.
   */
  get hasActiveFilters(): IFilterInstance<P, E>["hasActiveFilters"] {
    // if the expression is null, return false
    if (!this.expression) return false;
    // if there are no conditions, return false
    if (this.allConditionsForDisplay.length === 0) return false;
    // if there are conditions, return true if any of them have a valid value
    return this.allConditionsForDisplay.some((condition) => hasValidValue(condition.value));
  }

  /**
   * Checks if the filter instance has any changes with respect to the initial expression.
   * @returns True if the filter instance has any changes, false otherwise.
   */
  get hasChanges(): IFilterInstance<P, E>["hasChanges"] {
    return !deepCompareFilterExpressions(this.initialFilterExpression, this.expression);
  }

  /**
   * Returns the visibility of the filter instance.
   * @returns The visibility of the filter instance.
   */
  get isVisible(): IFilterInstance<P, E>["isVisible"] {
    return this.helper.isVisible;
  }

  /**
   * Returns all conditions from the filter expression.
   * @returns An array of filter conditions.
   */
  get allConditions(): IFilterInstance<P, E>["allConditions"] {
    if (!this.expression) return [];
    return extractConditions(this.expression);
  }

  /**
   * Returns all conditions in the filter expression for display purposes.
   * @returns An array of filter conditions for display purposes.
   */
  get allConditionsForDisplay(): IFilterInstance<P, E>["allConditionsForDisplay"] {
    if (!this.expression) return [];
    return extractConditionsWithDisplayOperators(this.expression);
  }

  // ------------ computed option helpers ------------

  /**
   * Returns the clear filter options.
   * @returns The clear filter options.
   */
  get clearFilterOptions(): IFilterInstance<P, E>["clearFilterOptions"] {
    return this.expressionOptions.clearFilterOptions;
  }

  /**
   * Returns the save view options.
   * @returns The save view options.
   */
  get saveViewOptions(): IFilterInstance<P, E>["saveViewOptions"] {
    return this.expressionOptions.saveViewOptions;
  }

  /**
   * Returns the update view options.
   * @returns The update view options.
   */
  get updateViewOptions(): IFilterInstance<P, E>["updateViewOptions"] {
    return this.expressionOptions.updateViewOptions;
  }

  // ------------ computed permissions ------------

  /**
   * Checks if the filter expression can be cleared.
   * @returns True if the filter expression can be cleared, false otherwise.
   */
  get canClearFilters(): IFilterInstance<P, E>["canClearFilters"] {
    if (!this.expression) return false;
    if (this.allConditionsForDisplay.length === 0) return false;
    return this.clearFilterOptions ? !this.clearFilterOptions.isDisabled : true;
  }

  /**
   * Checks if the filter expression can be saved as a view.
   * @returns True if the filter instance can be saved, false otherwise.
   */
  get canSaveView(): IFilterInstance<P, E>["canSaveView"] {
    return this.hasActiveFilters && !!this.saveViewOptions && !this.saveViewOptions.isDisabled;
  }

  /**
   * Checks if the filter expression can be updated as a view.
   * @returns True if the filter expression can be updated, false otherwise.
   */
  get canUpdateView(): IFilterInstance<P, E>["canUpdateView"] {
    return (
      !!this.updateViewOptions &&
      (this.hasChanges || !!this.updateViewOptions.hasAdditionalChanges) &&
      !this.updateViewOptions.isDisabled
    );
  }

  // ------------ actions ------------

  /**
   * Toggles the visibility of the filter instance.
   * @param isVisible - The visibility to set.
   */
  toggleVisibility: IFilterInstance<P, E>["toggleVisibility"] = action((isVisible) => {
    this.helper.toggleVisibility(isVisible);
  });

  /**
   * Resets the filter expression to the initial expression.
   * @param externalExpression - The external expression to reset to.
   */
  resetExpression: IFilterInstance<P, E>["resetExpression"] = action(
    (externalExpression, shouldResetInitialExpression = true) => {
      this.expression = this.helper.initializeExpression(externalExpression);
      if (shouldResetInitialExpression) {
        this._resetInitialFilterExpression();
      }
      this._notifyExpressionChange();
    }
  );

  /**
   * Finds all conditions by property and operator.
   * @param property - The property to find the conditions by.
   * @param operator - The operator to find the conditions by.
   * @returns All the conditions that match the property and operator.
   */
  findConditionsByPropertyAndOperator: IFilterInstance<P, E>["findConditionsByPropertyAndOperator"] = action(
    (property, operator) => {
      if (!this.expression) return [];
      return findConditionsByPropertyAndOperator(this.expression, property, operator);
    }
  );

  /**
   * Finds the first condition by property and operator.
   * @param property - The property to find the condition by.
   * @param operator - The operator to find the condition by.
   * @returns The first condition that matches the property and operator.
   */
  findFirstConditionByPropertyAndOperator: IFilterInstance<P, E>["findFirstConditionByPropertyAndOperator"] = action(
    (property, operator) => {
      if (!this.expression) return undefined;
      const conditions = findConditionsByPropertyAndOperator(this.expression, property, operator);
      return conditions[0];
    }
  );

  /**
   * Adds a condition to the filter expression.
   * @param groupOperator - The logical operator to use for the condition.
   * @param condition - The condition to add.
   * @param isNegation - Whether the condition should be negated.
   */
  addCondition: IFilterInstance<P, E>["addCondition"] = action((groupOperator, condition, isNegation = false) => {
    const conditionValue = condition.value;

    this.expression = this.helper.addConditionToExpression(this.expression, groupOperator, condition, isNegation);

    if (hasValidValue(conditionValue)) {
      this._notifyExpressionChange();
    }
  });

  /**
   * Updates the property of a condition in the filter expression.
   * @param conditionId - The id of the condition to update.
   * @param property - The new property for the condition.
   */
  updateConditionProperty: IFilterInstance<P, E>["updateConditionProperty"] = action(
    (conditionId: string, property: P, operator: TSupportedOperators, isNegation: boolean) => {
      if (!this.expression) return;
      const conditionBeforeUpdate = cloneDeep(findNodeById(this.expression, conditionId));
      if (!conditionBeforeUpdate || conditionBeforeUpdate.type !== FILTER_NODE_TYPE.CONDITION) return;

      // Update the condition property
      const updatedExpression = this.helper.handleConditionPropertyUpdate(
        this.expression,
        conditionId,
        property,
        operator,
        isNegation
      );

      if (updatedExpression) {
        this.expression = updatedExpression;
        this._notifyExpressionChange();
      }
    }
  );

  /**
   * Updates the operator of a condition in the filter expression.
   * @param conditionId - The id of the condition to update.
   * @param operator - The new operator for the condition.
   */
  updateConditionOperator: IFilterInstance<P, E>["updateConditionOperator"] = action(
    (conditionId: string, operator: TSupportedOperators, isNegation: boolean) => {
      if (!this.expression) return;
      const conditionBeforeUpdate = cloneDeep(findNodeById(this.expression, conditionId));
      if (!conditionBeforeUpdate || conditionBeforeUpdate.type !== FILTER_NODE_TYPE.CONDITION) return;

      // Get the operator configs for the current and new operators
      const currentOperatorConfig = this.configManager
        .getConfigByProperty(conditionBeforeUpdate.property)
        ?.getOperatorConfig(conditionBeforeUpdate.operator);
      const newOperatorConfig = this.configManager
        .getConfigByProperty(conditionBeforeUpdate.property)
        ?.getOperatorConfig(operator);
      // Reset the value if the operator config types are different, or if either side of the change
      // is ISNULL - its value is a fixed boolean, not the array/date/text the field type otherwise implies.
      const shouldResetConditionValue =
        currentOperatorConfig?.type !== newOperatorConfig?.type ||
        operator === RELATIONAL_OPERATOR.ISNULL ||
        conditionBeforeUpdate.operator === RELATIONAL_OPERATOR.ISNULL;

      // Use restructuring logic for operator changes
      const updatedExpression = this.helper.restructureExpressionForOperatorChange(
        this.expression,
        conditionId,
        operator,
        isNegation,
        shouldResetConditionValue
      );

      if (updatedExpression) {
        this.expression = updatedExpression;
      }

      // Notify if the condition had a valid value before the change, or gained one as a result of it
      // (e.g. ISNULL's value is auto-populated and never goes through `updateConditionValue`).
      const updatedCondition = this.expression ? findNodeById(this.expression, conditionId) : null;
      const updatedValue =
        updatedCondition && updatedCondition.type === FILTER_NODE_TYPE.CONDITION ? updatedCondition.value : undefined;
      if (hasValidValue(conditionBeforeUpdate.value) || hasValidValue(updatedValue)) {
        this._notifyExpressionChange();
      }
    }
  );

  /**
   * Updates the value of a condition in the filter expression with automatic optimization.
   * @param conditionId - The id of the condition to update.
   * @param value - The new value for the condition.
   * @param forceUpdate - Whether to force the update even if the value is the same as the condition before update.
   */
  updateConditionValue: IFilterInstance<P, E>["updateConditionValue"] = action(
    <V extends TFilterValue>(conditionId: string, value: SingleOrArray<V>, forceUpdate: boolean = false) => {
      // If the expression is not valid, return
      if (!this.expression) return;

      // Get the condition before update
      const conditionBeforeUpdate = cloneDeep(findNodeById(this.expression, conditionId));

      // If the condition is not valid, return
      if (!conditionBeforeUpdate || conditionBeforeUpdate.type !== FILTER_NODE_TYPE.CONDITION) return;

      // If the value is not valid, remove the condition
      if (!hasValidValue(value)) {
        this.removeCondition(conditionId);
        return;
      }

      // If the value is the same as the condition before update, return
      if (!forceUpdate && isEqual(conditionBeforeUpdate.value, value)) {
        return;
      }

      // Update the condition value
      updateNodeInExpression(this.expression, conditionId, {
        value,
      });

      // Notify the change
      this._notifyExpressionChange();
    }
  );

  /**
   * Removes a condition from the filter expression.
   * @param conditionId - The id of the condition to remove.
   */
  removeCondition: IFilterInstance<P, E>["removeCondition"] = action((conditionId) => {
    if (!this.expression) return;
    const { expression, shouldNotify } = removeNodeFromExpression(this.expression, conditionId);
    this.expression = expression;
    if (shouldNotify) {
      this._notifyExpressionChange();
    }
  });

  // ------------ group actions (advanced/nested AND-OR-NOT tree builder) ------------

  /**
   * Normalizes the root of the expression into an explicit group node, so the advanced tree
   * builder always has a stable root group id to target with `addConditionToGroup`/`addGroup`/etc.
   * A no-op if the root is already a group (including `null`, which becomes an empty AND group).
   * This is purely an editing-time convenience: wrapping a lone condition in a single-child AND
   * group is externally equivalent (see `unwrapGroupIfNeeded`, which the adapter's serialization
   * path already applies), so calling this never changes what gets saved - simple mode and advanced
   * mode operate on the exact same underlying expression, never two parallel representations.
   */
  ensureRootGroup: IFilterInstance<P, E>["ensureRootGroup"] = action(() => {
    if (!this.expression) {
      this.expression = createGroupNode([]);
      return;
    }
    if (isConditionNode(this.expression)) {
      this.expression = createGroupNode([this.expression]);
    }
  });

  /**
   * Adds a condition directly to a specific group, by id. Used by the advanced tree builder, where
   * every "+ Condition" button is scoped to the group it's rendered inside - as opposed to
   * `addCondition`, which operates on the (possibly implicit) root and is used by simple mode.
   * @param groupId - The id of the group to add the condition to (call `ensureRootGroup()` first if
   * targeting the root, so it is guaranteed to have an id to find).
   * @param condition - The condition to add.
   * @param isNegation - Whether the condition should be negated.
   */
  addConditionToGroup: IFilterInstance<P, E>["addConditionToGroup"] = action(
    <V extends TFilterValue>(groupId: string, condition: TFilterConditionPayload<P, V>, isNegation = false) => {
      const group = this.expression ? findNodeById(this.expression, groupId) : null;
      if (!group || !isGroupNode(group)) {
        console.warn(`addConditionToGroup: group "${groupId}" not found.`);
        return;
      }
      if (this.allConditions.length >= FILTER_TREE_MAX_CONDITIONS) {
        console.warn(
          `Cannot add condition: filter already has the maximum of ${FILTER_TREE_MAX_CONDITIONS} conditions.`
        );
        return;
      }

      const conditionNode = createConditionNode({
        ...condition,
        value: condition.value ?? getDefaultValueForOperator(condition.operator),
        isNegation,
      });
      group.children.push(conditionNode);

      if (hasValidValue(conditionNode.value)) {
        this._notifyExpressionChange();
      }
    }
  );

  /**
   * Adds a new, empty nested group under a specific parent group, by id.
   * The new group starts with no children - the user populates it via its own scoped "+ Condition"
   * / "+ Group" buttons (an empty group is tolerated, not an error - see feature spec "Groupes de
   * filtres imbriques AND/OR", requirement 4).
   * @param parentGroupId - The id of the group to nest the new group under.
   * @param logicalOperator - The new group's own logical operator (defaults to AND; the user can
   * toggle it afterwards via `toggleGroupOperator`).
   */
  addGroup: IFilterInstance<P, E>["addGroup"] = action((parentGroupId, logicalOperator = LOGICAL_OPERATOR.AND) => {
    const parent = this.expression ? findNodeById(this.expression, parentGroupId) : null;
    if (!parent || !isGroupNode(parent)) {
      console.warn(`addGroup: parent group "${parentGroupId}" not found.`);
      return;
    }

    const parentDepth = this._getNodeDepth(parentGroupId);
    if (parentDepth >= FILTER_TREE_MAX_DEPTH) {
      console.warn(`Cannot add group: maximum nesting depth of ${FILTER_TREE_MAX_DEPTH} reached.`);
      return;
    }

    parent.children.push(createGroupNode([], logicalOperator));
    // an empty group carries no filtering meaning yet - nothing to notify
  });

  /**
   * Flips a group's logical operator between AND and OR.
   * @param groupId - The id of the group to toggle.
   */
  toggleGroupOperator: IFilterInstance<P, E>["toggleGroupOperator"] = action((groupId) => {
    const group = this.expression ? findNodeById(this.expression, groupId) : null;
    if (!group || !isGroupNode(group)) {
      console.warn(`toggleGroupOperator: group "${groupId}" not found.`);
      return;
    }
    group.logicalOperator = group.logicalOperator === LOGICAL_OPERATOR.AND ? LOGICAL_OPERATOR.OR : LOGICAL_OPERATOR.AND;
    this._notifyExpressionChange();
  });

  /**
   * Flips a group's negation flag (equivalent to wrapping/unwrapping it in "NOT (...)").
   * @param groupId - The id of the group to toggle.
   */
  toggleGroupNegate: IFilterInstance<P, E>["toggleGroupNegate"] = action((groupId) => {
    const group = this.expression ? findNodeById(this.expression, groupId) : null;
    if (!group || !isGroupNode(group)) {
      console.warn(`toggleGroupNegate: group "${groupId}" not found.`);
      return;
    }
    group.negate = !group.negate;
    this._notifyExpressionChange();
  });

  /**
   * Removes a group (and all of its children) from the filter expression.
   * Reuses the same generic removal used by `removeCondition` - both conditions and groups are
   * found/removed purely by id, so there is nothing group-specific about the removal itself.
   * @param groupId - The id of the group to remove.
   */
  removeGroup: IFilterInstance<P, E>["removeGroup"] = action((groupId) => {
    if (!this.expression) return;
    const { expression, shouldNotify } = removeNodeFromExpression(this.expression, groupId);
    this.expression = expression;
    if (shouldNotify) {
      this._notifyExpressionChange();
    }
  });

  /**
   * Reorders a condition/group up or down among its siblings within the same parent group.
   * There is no cross-group move in v1 (moving a node into a *different* parent group) - delete
   * and re-add it there instead; see the feature report for this scope decision.
   * @param nodeId - The id of the condition/group to move.
   * @param direction - Whether to move it up or down among its siblings.
   */
  moveNode: IFilterInstance<P, E>["moveNode"] = action((nodeId, direction) => {
    if (!this.expression) return;
    const parent = this._getParentOf(nodeId);
    if (!parent) {
      console.warn(`moveNode: node "${nodeId}" is the root, or was not found - nothing to reorder against.`);
      return;
    }

    const index = parent.children.findIndex((child) => child.id === nodeId);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= parent.children.length) return;

    const [movedNode] = parent.children.splice(index, 1);
    parent.children.splice(targetIndex, 0, movedNode);
    this._notifyExpressionChange();
  });

  /**
   * Duplicates a condition/group as a new sibling immediately after the original, with fresh ids
   * generated throughout (so the duplicate is a fully independent node, not a shared reference).
   * @param nodeId - The id of the condition/group to duplicate.
   */
  duplicateNode: IFilterInstance<P, E>["duplicateNode"] = action((nodeId) => {
    if (!this.expression) return;
    const parent = this._getParentOf(nodeId);
    if (!parent) {
      console.warn(`duplicateNode: node "${nodeId}" is the root, or was not found - nothing to duplicate into.`);
      return;
    }

    const node = findNodeById(this.expression, nodeId);
    if (!node) return;

    const conditionCountToAdd = isConditionNode(node) ? 1 : extractConditions(node).length;
    if (this.allConditions.length + conditionCountToAdd > FILTER_TREE_MAX_CONDITIONS) {
      console.warn(`Cannot duplicate: would exceed the maximum of ${FILTER_TREE_MAX_CONDITIONS} conditions.`);
      return;
    }

    const duplicate = this._cloneExpressionWithNewIds(node);
    const index = parent.children.findIndex((child) => child.id === nodeId);
    parent.children.splice(index + 1, 0, duplicate);

    if (shouldNotifyChangeForExpression(duplicate)) {
      this._notifyExpressionChange();
    }
  });

  /**
   * Clears the filter expression.
   */
  clearFilters: IFilterInstance<P, E>["clearFilters"] = action(async () => {
    if (this.canClearFilters) {
      const shouldNotify = shouldNotifyChangeForExpression(this.expression);
      this.expression = null;
      await this.clearFilterOptions?.onFilterClear();
      if (shouldNotify) {
        this._notifyExpressionChange();
      }
    } else {
      console.warn("Cannot clear filters: invalid expression or missing options.");
    }
  });

  /**
   * Saves the filter expression.
   */
  saveView: IFilterInstance<P, E>["saveView"] = action(async () => {
    if (this.canSaveView && this.saveViewOptions) {
      await this.saveViewOptions.onViewSave(this._getExternalExpression());
    } else {
      console.warn("Cannot save view: invalid expression or missing options.");
    }
  });

  /**
   * Updates the filter expression.
   */
  updateView: IFilterInstance<P, E>["updateView"] = action(async () => {
    if (this.canUpdateView && this.updateViewOptions) {
      await this.updateViewOptions.onViewUpdate(this._getExternalExpression());
      this._resetInitialFilterExpression();
    } else {
      console.warn("Cannot update view: invalid expression or missing options.");
    }
  });

  /**
   * Updates the expression options for the filter instance.
   * This allows dynamic updates to options like isDisabled properties.
   */
  updateExpressionOptions: IFilterInstance<P, E>["updateExpressionOptions"] = action((newOptions) => {
    this.expressionOptions = {
      ...this.expressionOptions,
      ...newOptions,
    };
  });

  // ------------ private helpers ------------
  /**
   * Resets the initial filter expression to the current expression.
   */
  private _resetInitialFilterExpression(): void {
    this.initialFilterExpression = cloneDeep(this.expression);
  }

  /**
   * Returns the external filter representation of the filter instance.
   * @returns The external filter representation of the filter instance.
   */
  private _getExternalExpression = computedFn(() =>
    this.adapter.toExternal(sanitizeAndStabilizeExpression(toJS(this.expression)))
  );

  /**
   * Notifies the parent component of the expression change.
   */
  private _notifyExpressionChange(): void {
    this.onExpressionChange?.(this._getExternalExpression());
  }

  /**
   * Returns the immediate parent group of a node, or null if the node is the root itself (the root
   * has no parent to reorder/duplicate/nest against) or was not found.
   * @param nodeId - The id of the node whose parent to find.
   */
  private _getParentOf(nodeId: string): TFilterGroupNode<P> | null {
    if (!this.expression) return null;
    const parentChain = findParentChain(this.expression, nodeId);
    return parentChain && parentChain.length > 0 ? parentChain[0] : null;
  }

  /**
   * Returns the nesting depth of a node (root = 1, matching the backend's `ComplexFilterBackend`
   * depth accounting), assuming the node is known to exist in the tree (callers only use this after
   * already locating the node via `findNodeById`).
   * @param nodeId - The id of the node whose depth to compute.
   */
  private _getNodeDepth(nodeId: string): number {
    if (!this.expression) return 0;
    if (this.expression.id === nodeId) return 1;
    const parentChain = findParentChain(this.expression, nodeId);
    return (parentChain?.length ?? 0) + 1;
  }

  /**
   * Deep-clones an expression subtree, generating fresh ids throughout (used by `duplicateNode`).
   * @param node - The subtree to clone.
   */
  private _cloneExpressionWithNewIds(node: TFilterExpression<P>): TFilterExpression<P> {
    if (isConditionNode(node)) {
      return { ...node, id: uuidv4() };
    }
    return {
      ...node,
      id: uuidv4(),
      children: node.children.map((child) => this._cloneExpressionWithNewIds(child)),
    };
  }
}
