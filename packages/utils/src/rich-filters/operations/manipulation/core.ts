/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {
  TFilterConditionPayload,
  TFilterExpression,
  TFilterGroupNode,
  TFilterProperty,
  TFilterValue,
  TLogicalOperator,
} from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";
// local imports
import { createGroupNode } from "../../factories/nodes/core";
import { getGroupChildren } from "../../types";
import { isConditionNode, isGroupNode } from "../../types/core";
import { shouldUnwrapGroup } from "../../validators/shared";
import { transformExpressionTree } from "../transformation/core";

/**
 * Adds a condition to the filter expression, combined via the given logical operator.
 * - No existing expression: the condition becomes the whole expression.
 * - Existing expression is a bare condition: both are wrapped in a new group using `logicalOperator`.
 * - Existing expression is a group already using `logicalOperator` (and not negated - negation
 *   changes what the group means, so we never silently push into a negated group): the condition
 *   is appended directly to its children.
 * - Existing expression is a group using a different operator (or negated): both are wrapped in a
 *   new group using `logicalOperator`, preserving the existing group's own semantics intact.
 * @param expression - The current filter expression
 * @param condition - The condition (or group) to add
 * @param logicalOperator - The logical operator to combine with (defaults to AND)
 * @returns The updated filter expression
 */
export const addConditionToGroupWithOperator = <P extends TFilterProperty>(
  expression: TFilterExpression<P> | null,
  condition: TFilterExpression<P>,
  logicalOperator: TLogicalOperator = LOGICAL_OPERATOR.AND
): TFilterExpression<P> => {
  // if no expression, set the new condition
  if (!expression) {
    return condition;
  }
  // if the expression is a condition, wrap both in a new group using the requested operator
  if (isConditionNode(expression)) {
    return createGroupNode([expression, condition], logicalOperator);
  }
  // if the expression is already a group using the requested operator (and isn't negated), extend it directly
  if (isGroupNode(expression) && expression.logicalOperator === logicalOperator && !expression.negate) {
    expression.children.push(condition);
    return expression;
  }
  // otherwise (different operator, or a negated group), wrap the existing expression and the new
  // condition/group in a new group using the requested operator
  if (isGroupNode(expression)) {
    return createGroupNode([expression, condition], logicalOperator);
  }
  // Throw error for unexpected expression type
  console.error("Invalid expression type", expression);
  return expression;
};

/**
 * Adds an AND condition to the filter expression.
 * @param expression - The current filter expression
 * @param condition - The condition to add
 * @returns The updated filter expression
 */
export const addAndCondition = <P extends TFilterProperty>(
  expression: TFilterExpression<P> | null,
  condition: TFilterExpression<P>
): TFilterExpression<P> => addConditionToGroupWithOperator(expression, condition, LOGICAL_OPERATOR.AND);

/**
 * Adds an OR condition to the filter expression.
 * @param expression - The current filter expression
 * @param condition - The condition to add
 * @returns The updated filter expression
 */
export const addOrCondition = <P extends TFilterProperty>(
  expression: TFilterExpression<P> | null,
  condition: TFilterExpression<P>
): TFilterExpression<P> => addConditionToGroupWithOperator(expression, condition, LOGICAL_OPERATOR.OR);

/**
 * Replaces a node in the expression tree with another node.
 * Uses transformExpressionTree for consistent tree processing and better maintainability.
 * @param expression - The expression tree to search in
 * @param targetId - The ID of the node to replace
 * @param replacement - The node to replace with
 * @returns The updated expression tree
 */
export const replaceNodeInExpression = <P extends TFilterProperty>(
  expression: TFilterExpression<P>,
  targetId: string,
  replacement: TFilterExpression<P>
): TFilterExpression<P> => {
  const result = transformExpressionTree(expression, (node: TFilterExpression<P>) => {
    // If this is the node we want to replace, return the replacement
    if (node.id === targetId) {
      return {
        expression: replacement,
        shouldNotify: false,
      };
    }
    // For all other nodes, let the generic transformer handle the recursion
    return { expression: node, shouldNotify: false };
  });

  // Since we're doing a replacement, the result should never be null
  return result.expression || expression;
};

/**
 * Updates a node in the filter expression.
 * Uses recursive tree traversal with proper type handling.
 * @param expression - The filter expression to update
 * @param targetId - The id of the node to update
 * @param updates - The updates to apply to the node
 */
export const updateNodeInExpression = <P extends TFilterProperty>(
  expression: TFilterExpression<P>,
  targetId: string,
  updates: Partial<TFilterConditionPayload<P, TFilterValue>>
) => {
  // Helper function to recursively update nodes
  const updateNode = (node: TFilterExpression<P>): void => {
    if (node.id === targetId) {
      if (!isConditionNode<P, TFilterValue>(node)) {
        console.warn("updateNodeInExpression: targetId matched a group; ignoring updates");
        return;
      }
      Object.assign(node, updates);
      return;
    }

    if (isGroupNode(node)) {
      const children = getGroupChildren(node);
      children.forEach((child) => updateNode(child));
    }
  };

  updateNode(expression);
};

/**
 * Unwraps a group if it meets the unwrapping criteria, otherwise returns the group.
 * @param group - The group node to potentially unwrap
 * @param preserveNotGroups - Whether to preserve NOT groups even with single children
 * @returns The unwrapped child or the original group
 */
export const unwrapGroupIfNeeded = <P extends TFilterProperty>(
  group: TFilterGroupNode<P>,
  preserveNotGroups = true
) => {
  if (shouldUnwrapGroup(group, preserveNotGroups)) {
    const children = getGroupChildren(group);
    return children[0];
  }
  return group;
};
