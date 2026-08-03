/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TFilterConditionNode,
  TFilterExpression,
  TFilterFieldType,
  TFilterGroupNode,
  TFilterProperty,
  TFilterValue,
} from "@plane/types";
import { FILTER_FIELD_TYPE, FILTER_NODE_TYPE, LOGICAL_OPERATOR } from "@plane/types";

/**
 * Type guard to check if a node is a condition node.
 * @param node - The node to check
 * @returns True if the node is a condition node
 */
export const isConditionNode = <P extends TFilterProperty, V extends TFilterValue>(
  node: TFilterExpression<P>
): node is TFilterConditionNode<P, V> => node.type === FILTER_NODE_TYPE.CONDITION;

/**
 * Type guard to check if a node is a group node.
 * @param node - The node to check
 * @returns True if the node is a group node
 */
export const isGroupNode = <P extends TFilterProperty>(node: TFilterExpression<P>): node is TFilterGroupNode<P> =>
  node.type === FILTER_NODE_TYPE.GROUP;

/**
 * Checks whether a group node uses the AND logical operator.
 * Not a type guard - AND/OR groups share the exact same shape (`TFilterGroupNode`), only the
 * `logicalOperator` value differs, so there is nothing to narrow.
 * @param group - The group node to check
 * @returns True if the group is an AND group
 */
export const isAndGroupNode = <P extends TFilterProperty>(group: TFilterGroupNode<P>): boolean =>
  group.logicalOperator === LOGICAL_OPERATOR.AND;

/**
 * Checks whether a group node uses the OR logical operator.
 * @param group - The group node to check
 * @returns True if the group is an OR group
 */
export const isOrGroupNode = <P extends TFilterProperty>(group: TFilterGroupNode<P>): boolean =>
  group.logicalOperator === LOGICAL_OPERATOR.OR;

/**
 * Checks whether a group node is negated (equivalent to being wrapped in a logical NOT).
 * @param group - The group node to check
 * @returns True if the group is negated
 */
export const isNegatedGroupNode = <P extends TFilterProperty>(group: TFilterGroupNode<P>): boolean =>
  group.negate === true;

/**
 * Type guard to check if a filter type is a date filter type.
 * @param type - The filter type to check
 * @returns True if the filter type is a date filter type
 */
export const isDateFilterType = (
  type: TFilterFieldType
): type is typeof FILTER_FIELD_TYPE.DATE | typeof FILTER_FIELD_TYPE.DATE_RANGE =>
  type === FILTER_FIELD_TYPE.DATE || type === FILTER_FIELD_TYPE.DATE_RANGE;
