/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import type { SingleOrArray } from "../utils";
import type { TSupportedOperators, TLogicalOperator, TAllAvailableOperatorsForDisplay } from "./operators";

/**
 * Filter node types for building hierarchical filter trees.
 * - CONDITION: Single filter for one field (e.g., "state is backlog")
 * - GROUP: Logical container combining multiple filters with AND/OR or single filter/group with NOT
 */
export const FILTER_NODE_TYPE = {
  CONDITION: "condition",
  GROUP: "group",
} as const;
export type TFilterNodeType = (typeof FILTER_NODE_TYPE)[keyof typeof FILTER_NODE_TYPE];

/**
 * Field property key that can be filtered (e.g., "state", "assignee", "created_at").
 */
export type TFilterProperty = string;

/**
 * Allowed filter values - primitives plus null/undefined for empty states.
 */
export type TFilterValue = string | number | Date | boolean | null | undefined;

/**
 * Base properties shared by all filter nodes.
 * - id: Unique identifier for the node
 * - type: Node type (condition or group)
 */
type TBaseFilterNode = {
  id: string;
  type: TFilterNodeType;
};

/**
 * Leaf node representing a single filter condition (e.g., "state is backlog").
 * - type: Node type (condition)
 * - property: Field being filtered
 * - operator: Comparison operator (is, is any of, between, etc.) - always the base/positive operator
 * - value: Filter value(s) - array for operators that support multiple values
 * - isNegation: Whether this condition should be negated (e.g., "is not", "is not any of").
 *   Negation is tracked per-condition rather than via a wrapping NOT group.
 * @template P - Property key type
 * @template V - Value type
 */
export type TFilterConditionNode<P extends TFilterProperty, V extends TFilterValue> = TBaseFilterNode & {
  type: typeof FILTER_NODE_TYPE.CONDITION;
  property: P;
  operator: TSupportedOperators;
  value: SingleOrArray<V>;
  isNegation?: boolean;
};

/**
 * Filter condition node for display purposes.
 */
export type TFilterConditionNodeForDisplay<P extends TFilterProperty, V extends TFilterValue> = Omit<
  TFilterConditionNode<P, V>,
  "operator"
> & {
  operator: TAllAvailableOperatorsForDisplay;
};

/**
 * Container node that combines multiple children (conditions and/or nested groups) with a single
 * logical operator (AND/OR), optionally negating the whole group.
 * - type: Node type (group)
 * - logicalOperator: AND/OR operator for combining child filters
 * - negate: Whether the entire group is logically negated (equivalent to wrapping it in "NOT (...)").
 *   Negation is tracked per-group rather than via a distinct NOT node kind - a group is a single
 *   shape regardless of operator/negation, which keeps `isGroupNode()` a single check and every
 *   traversal utility trivially compatible with AND, OR, and negated groups alike.
 * - children: Child conditions and/or nested groups. An empty array is tolerated (see feature spec
 *   "Groupes de filtres imbriques AND/OR"): an empty group is ignored at evaluation time and
 *   pruned automatically by the UI while editing.
 * @template P - Property key type
 */
export type TFilterGroupNode<P extends TFilterProperty> = TBaseFilterNode & {
  type: typeof FILTER_NODE_TYPE.GROUP;
  logicalOperator: TLogicalOperator;
  negate?: boolean;
  children: TFilterExpression<P>[];
};

/**
 * Union type for any filter node - either a single condition or a group container.
 * @template P - Property key type
 * @template V - Value type
 */
export type TFilterExpression<P extends TFilterProperty, V extends TFilterValue = TFilterValue> =
  | TFilterConditionNode<P, V>
  | TFilterGroupNode<P>;

/**
 * Payload for creating/updating condition nodes - excludes base node properties.
 * @template P - Property key type
 * @template V - Value type
 */
export type TFilterConditionPayload<P extends TFilterProperty, V extends TFilterValue> = Omit<
  TFilterConditionNode<P, V>,
  keyof TBaseFilterNode
>;

/**
 * Payload for creating/updating group nodes - excludes base node properties.
 * @template P - Property key type
 */
export type TFilterGroupPayload<P extends TFilterProperty> = Omit<TFilterGroupNode<P>, keyof TBaseFilterNode>;
