/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { v4 as uuidv4 } from "uuid";
// plane imports
import type {
  TFilterConditionNode,
  TFilterConditionPayload,
  TFilterExpression,
  TFilterGroupNode,
  TFilterProperty,
  TFilterValue,
  TLogicalOperator,
} from "@plane/types";
import { FILTER_NODE_TYPE, LOGICAL_OPERATOR } from "@plane/types";

/**
 * Creates a condition node with a unique ID.
 * @param condition - The condition to create
 * @returns The created condition node
 */
export const createConditionNode = <P extends TFilterProperty, V extends TFilterValue>(
  condition: TFilterConditionPayload<P, V>
): TFilterConditionNode<P, V> => ({
  id: uuidv4(),
  type: FILTER_NODE_TYPE.CONDITION,
  ...condition,
});

/**
 * Creates a group node with a unique ID.
 * @param nodes - The child nodes (conditions and/or nested groups) to add to the group
 * @param logicalOperator - The logical operator combining the group's children (defaults to AND)
 * @param negate - Whether the group should be negated (equivalent to wrapping it in "NOT (...)")
 * @returns The created group node
 */
export const createGroupNode = <P extends TFilterProperty>(
  nodes: TFilterExpression<P>[],
  logicalOperator: TLogicalOperator = LOGICAL_OPERATOR.AND,
  negate = false
): TFilterGroupNode<P> => ({
  id: uuidv4(),
  type: FILTER_NODE_TYPE.GROUP,
  logicalOperator,
  ...(negate ? { negate: true } : {}),
  children: nodes,
});

/**
 * Creates an AND group node with a unique ID.
 * @param nodes - The nodes to add to the group
 * @returns The created AND group node
 */
export const createAndGroupNode = <P extends TFilterProperty>(nodes: TFilterExpression<P>[]): TFilterGroupNode<P> =>
  createGroupNode(nodes, LOGICAL_OPERATOR.AND);

/**
 * Creates an OR group node with a unique ID.
 * @param nodes - The nodes to add to the group
 * @returns The created OR group node
 */
export const createOrGroupNode = <P extends TFilterProperty>(nodes: TFilterExpression<P>[]): TFilterGroupNode<P> =>
  createGroupNode(nodes, LOGICAL_OPERATOR.OR);
